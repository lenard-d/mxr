use crate::error::ImapProviderError;
use crate::folders;
use crate::session::ImapSession;
use crate::types::{FetchedMessage, ImapCapabilities, ImapDraftIdentity, MailboxInfo};
use crate::ImapProvider;
use async_trait::async_trait;
use mxr_core::error::MxrError;
use mxr_core::provider::MailSendProvider;
use mxr_core::types::{Address, Draft, SendReceipt, ServerDraftSnapshot};
use sha2::{Digest, Sha256};
use std::sync::Arc;

const DRAFT_FETCH_QUERY: &str = "BODY.PEEK[]";
const DRAFT_SEARCH_QUERY: &str = "ALL";

fn no_drafts_folder_error() -> MxrError {
    MxrError::Provider(
        "IMAP server has no listed SPECIAL-USE \\Drafts folder; refusing to invent a mutation mailbox".into(),
    )
}

/// An IMAP-backed server-draft surface paired with an existing SMTP sender.
///
/// IMAP remains the source of truth for draft discovery and storage. SMTP is
/// used only for submission, calendar replies, and the ordinary send path;
/// this adapter never appends a sent copy because the account's
/// `ImapProvider` already owns that sync-side behavior.
pub struct ImapSmtpSendProvider {
    imap: Arc<ImapProvider>,
    smtp: Arc<dyn MailSendProvider>,
}

impl ImapSmtpSendProvider {
    pub fn new(imap: Arc<ImapProvider>, smtp: Arc<dyn MailSendProvider>) -> Self {
        Self { imap, smtp }
    }
}

struct OpenDraftsSession {
    session: Box<dyn ImapSession>,
    mailbox: String,
    mailbox_info: MailboxInfo,
    capabilities: ImapCapabilities,
}

impl ImapProvider {
    async fn open_drafts_session(&self) -> mxr_core::provider::Result<Option<OpenDraftsSession>> {
        let mut session = self
            .session_factory
            .create_session()
            .await
            .map_err(MxrError::from)?;
        let capabilities = session.capabilities().await.map_err(MxrError::from)?;
        Self::enable_session(&mut *session, &capabilities).await?;

        let folders = session.list_folders().await.map_err(MxrError::from)?;
        let Some(mailbox) = folders::resolve_drafts_folder(&folders) else {
            let _ = session.logout().await;
            return Ok(None);
        };
        let mailbox_info = session.select(&mailbox).await.map_err(MxrError::from)?;
        if mailbox_info.uid_validity == 0 {
            return Err(MxrError::Provider(
                "IMAP Drafts SELECT did not provide UIDVALIDITY; refusing to create an unsafe draft identity".into(),
            ));
        }

        Ok(Some(OpenDraftsSession {
            session,
            mailbox,
            mailbox_info,
            capabilities,
        }))
    }

    async fn require_drafts_session(&self) -> mxr_core::provider::Result<OpenDraftsSession> {
        self.open_drafts_session()
            .await?
            .ok_or_else(no_drafts_folder_error)
    }

    async fn ensure_replacement_delete_safe(&self) -> mxr_core::provider::Result<()> {
        let mut opened = self.require_drafts_session().await?;
        let result = Self::require_uidplus(&opened.capabilities);
        let _ = opened.session.logout().await;
        result
    }

    async fn list_draft_ids(&self) -> mxr_core::provider::Result<Vec<String>> {
        let Some(mut opened) = self.open_drafts_session().await? else {
            return Err(no_drafts_folder_error());
        };
        let mut uids = opened
            .session
            .uid_search(DRAFT_SEARCH_QUERY)
            .await
            .map_err(MxrError::from)?;
        uids.sort_unstable();
        uids.dedup();
        if uids.is_empty() {
            let _ = opened.session.logout().await;
            return Ok(Vec::new());
        }

        let ids = uids
            .into_iter()
            .map(|uid| {
                folders::format_draft_provider_id(
                    &opened.mailbox,
                    opened.mailbox_info.uid_validity,
                    uid,
                )
            })
            .collect();
        let _ = opened.session.logout().await;
        Ok(ids)
    }

    async fn fetch_draft(
        &self,
        provider_draft_id: &str,
    ) -> mxr_core::provider::Result<Option<ServerDraftSnapshot>> {
        let identity =
            folders::parse_draft_provider_id(provider_draft_id).map_err(MxrError::from)?;
        let mut opened = self.require_drafts_session().await?;
        validate_current_identity(&identity, &opened.mailbox, opened.mailbox_info.uid_validity)?;

        let fetched = opened
            .session
            .uid_fetch(&identity.uid.to_string(), DRAFT_FETCH_QUERY)
            .await
            .map_err(MxrError::from)?;
        let _ = opened.session.logout().await;
        let Some(message) = fetched
            .into_iter()
            .find(|message| message.uid == identity.uid)
        else {
            // This is the only absence path: the mailbox and UIDVALIDITY were
            // current, and the exact UID was not returned by UID FETCH.
            return Ok(None);
        };
        snapshot_from_fetched(&identity, message).map(Some)
    }

    async fn append_draft(
        &self,
        rfc822: &[u8],
        message_id: &str,
    ) -> mxr_core::provider::Result<String> {
        let mut opened = self.require_drafts_session().await?;
        // RealImapSession cannot currently surface APPENDUID. Snapshot matching
        // UIDs first so a replacement that keeps its stable Message-ID can
        // distinguish the newly appended version from the old one.
        let preexisting_uids = exact_message_id_uids(&mut *opened.session, message_id).await?;
        let reported_uid = match opened
            .session
            .uid_append(&opened.mailbox, &["\\Draft"], rfc822)
            .await
        {
            Ok(uid) => uid,
            Err(append_error) => {
                // The server may have accepted APPEND before the connection or
                // tagged response was lost. Recover in a fresh session before
                // exposing a retry that could create a duplicate draft.
                let _ = opened.session.logout().await;
                let mut recovery = self.require_drafts_session().await?;
                let exact_matches =
                    exact_message_id_uids(&mut *recovery.session, message_id).await?;
                let new_matches = exact_matches
                    .into_iter()
                    .filter(|uid| !preexisting_uids.contains(uid))
                    .collect::<Vec<_>>();
                let recovered = match new_matches.as_slice() {
                    [uid] => Some(*uid),
                    [] => None,
                    _ => {
                        return Err(MxrError::Provider(format!(
                            "IMAP APPEND outcome is ambiguous: multiple new drafts have Message-ID {message_id}"
                        )));
                    }
                };
                if let Some(uid) = recovered {
                    let provider_id = folders::format_draft_provider_id(
                        &recovery.mailbox,
                        recovery.mailbox_info.uid_validity,
                        uid,
                    );
                    let _ = recovery.session.logout().await;
                    return Ok(provider_id);
                }
                return Err(MxrError::from(append_error));
            }
        };
        let had_reported_uid = reported_uid.is_some();

        let uid = match reported_uid {
            Some(uid) if uid > 0 => uid,
            Some(_) => {
                return Err(MxrError::Provider(
                    "IMAP APPEND returned invalid UID 0".into(),
                ));
            }
            None => {
                let exact_matches = exact_message_id_uids(&mut *opened.session, message_id).await?;
                let new_matches = exact_matches
                    .into_iter()
                    .filter(|uid| !preexisting_uids.contains(uid))
                    .collect::<Vec<_>>();
                match new_matches.as_slice() {
                    [uid] => *uid,
                    [] => {
                        return Err(MxrError::Provider(format!(
                            "IMAP APPEND completed but UID SEARCH could not identify a new draft with Message-ID {message_id}"
                        )));
                    }
                    _ => {
                        return Err(MxrError::Provider(format!(
                            "IMAP APPEND created multiple new drafts with Message-ID {message_id}; refusing an ambiguous draft link"
                        )));
                    }
                }
            }
        };

        if had_reported_uid {
            verify_appended_uid(&mut *opened.session, uid, message_id).await?;
        }

        let provider_id = folders::format_draft_provider_id(
            &opened.mailbox,
            opened.mailbox_info.uid_validity,
            uid,
        );
        let _ = opened.session.logout().await;
        Ok(provider_id)
    }

    async fn replace_draft(
        &self,
        provider_draft_id: &str,
        draft: &Draft,
        from: &Address,
    ) -> mxr_core::provider::Result<String> {
        let old_snapshot = self
            .fetch_draft(provider_draft_id)
            .await?
            .ok_or_else(|| MxrError::NotFound(format!("IMAP server draft {provider_draft_id}")))?;
        self.ensure_replacement_delete_safe().await?;
        let message_id = message_id_from_rfc822(&old_snapshot.raw_rfc822)
            .unwrap_or_else(|| deterministic_draft_message_id(draft, from));
        if let Some(recovered_id) = self
            .find_pending_replacement(provider_draft_id, &message_id)
            .await?
        {
            // A prior APPEND may have succeeded before deleting the old UID.
            // Do not adopt that candidate blindly: the local draft may have
            // changed since the failed attempt. Remove the stale candidate
            // first, then append the current local content below.
            self.delete_draft(&recovered_id).await.map_err(|error| {
                MxrError::Provider(format!(
                    "Recovered stale IMAP draft replacement {recovered_id}, but cleanup failed: {error}"
                ))
            })?;
        }
        let rfc822 = build_draft_rfc822(draft, from, &message_id).await?;
        let replacement_id = self.append_draft(&rfc822, &message_id).await?;
        if replacement_id == provider_draft_id {
            return Err(MxrError::Provider(
                "IMAP draft replacement reused the old UID; refusing to delete the replacement"
                    .into(),
            ));
        }

        // The new UID has already been obtained from APPENDUID or an exact
        // Message-ID search before this targeted deletion starts.
        if let Err(error) = self.delete_draft(provider_draft_id).await {
            return Err(MxrError::Provider(format!(
                "IMAP draft replacement {replacement_id} was appended but old draft deletion failed: {error}"
            )));
        }
        Ok(replacement_id)
    }

    async fn find_pending_replacement(
        &self,
        old_provider_draft_id: &str,
        message_id: &str,
    ) -> mxr_core::provider::Result<Option<String>> {
        let old_identity =
            folders::parse_draft_provider_id(old_provider_draft_id).map_err(MxrError::from)?;
        let mut opened = self.require_drafts_session().await?;
        validate_current_identity(
            &old_identity,
            &opened.mailbox,
            opened.mailbox_info.uid_validity,
        )?;
        let candidates = exact_message_id_uids(&mut *opened.session, message_id)
            .await?
            .into_iter()
            .filter(|uid| *uid != old_identity.uid)
            .collect::<Vec<_>>();
        let _ = opened.session.logout().await;
        match candidates.as_slice() {
            [] => Ok(None),
            [uid] => Ok(Some(folders::format_draft_provider_id(
                &old_identity.mailbox,
                old_identity.uid_validity,
                *uid,
            ))),
            _ => Err(MxrError::Provider(format!(
                "Multiple IMAP drafts share Message-ID {message_id}; refusing ambiguous replacement recovery"
            ))),
        }
    }

    async fn delete_draft(&self, provider_draft_id: &str) -> mxr_core::provider::Result<()> {
        let identity =
            folders::parse_draft_provider_id(provider_draft_id).map_err(MxrError::from)?;
        let mut opened = self.require_drafts_session().await?;
        validate_current_identity(&identity, &opened.mailbox, opened.mailbox_info.uid_validity)?;
        // delete_selected_message refuses non-UIDPLUS servers before issuing
        // any mutation and emits UID STORE before UID EXPUNGE for this UID.
        Self::delete_selected_message(
            &mut *opened.session,
            &identity.uid.to_string(),
            &opened.capabilities,
        )
        .await?;
        let _ = opened.session.logout().await;
        Ok(())
    }
}

#[async_trait]
impl MailSendProvider for ImapSmtpSendProvider {
    fn name(&self) -> &str {
        "imap+smtp"
    }

    fn supports_server_drafts(&self) -> bool {
        true
    }

    async fn send(
        &self,
        draft: &Draft,
        from: &Address,
        rfc2822_message_id: &str,
    ) -> mxr_core::provider::Result<SendReceipt> {
        self.smtp.send(draft, from, rfc2822_message_id).await
    }

    async fn send_server_draft(
        &self,
        provider_draft_id: &str,
        draft: &Draft,
        from: &Address,
        rfc2822_message_id: &str,
    ) -> mxr_core::provider::Result<SendReceipt> {
        let receipt = self.smtp.send(draft, from, rfc2822_message_id).await?;
        if let Err(error) = self.imap.delete_draft(provider_draft_id).await {
            return Err(MxrError::SendOutcomeUnknown(format!(
                "SMTP accepted the message but deleting IMAP draft {provider_draft_id} failed: {error}"
            )));
        }
        Ok(receipt)
    }

    async fn send_calendar_reply(
        &self,
        reply: &mxr_core::CalendarReplyMessage,
        from: &Address,
        rfc2822_message_id: &str,
    ) -> mxr_core::provider::Result<SendReceipt> {
        self.smtp
            .send_calendar_reply(reply, from, rfc2822_message_id)
            .await
    }

    async fn resolve_reply_thread_id(
        &self,
        draft: &Draft,
    ) -> mxr_core::provider::Result<Option<String>> {
        self.smtp.resolve_reply_thread_id(draft).await
    }

    async fn save_draft(
        &self,
        draft: &Draft,
        from: &Address,
    ) -> mxr_core::provider::Result<Option<String>> {
        let message_id = mxr_outbound::email::generate_message_id(from);
        self.save_draft_with_message_id(draft, from, &message_id)
            .await
    }

    async fn save_draft_with_message_id(
        &self,
        draft: &Draft,
        from: &Address,
        message_id: &str,
    ) -> mxr_core::provider::Result<Option<String>> {
        let rfc822 = build_draft_rfc822(draft, from, message_id).await?;
        self.imap.append_draft(&rfc822, message_id).await.map(Some)
    }

    async fn find_draft_by_message_id(
        &self,
        message_id: &str,
    ) -> mxr_core::provider::Result<Option<String>> {
        let expected = normalize_message_id(message_id);
        for provider_draft_id in self.imap.list_draft_ids().await? {
            let Some(snapshot) = self.imap.fetch_draft(&provider_draft_id).await? else {
                continue;
            };
            if message_id_from_rfc822(&snapshot.raw_rfc822)
                .is_some_and(|found| normalize_message_id(&found) == expected)
            {
                return Ok(Some(provider_draft_id));
            }
        }
        Ok(None)
    }

    async fn update_draft(
        &self,
        _provider_draft_id: &str,
        _draft: &Draft,
        _from: &Address,
    ) -> mxr_core::provider::Result<()> {
        Err(MxrError::Provider(
            "IMAP draft updates change the provider ID; use replace_draft".into(),
        ))
    }

    async fn replace_draft(
        &self,
        provider_draft_id: &str,
        draft: &Draft,
        from: &Address,
    ) -> mxr_core::provider::Result<String> {
        self.imap
            .replace_draft(provider_draft_id, draft, from)
            .await
    }

    async fn fetch_draft(
        &self,
        provider_draft_id: &str,
    ) -> mxr_core::provider::Result<Option<ServerDraftSnapshot>> {
        self.imap.fetch_draft(provider_draft_id).await
    }

    async fn list_draft_ids(&self) -> mxr_core::provider::Result<Vec<String>> {
        self.imap.list_draft_ids().await
    }

    async fn delete_draft(&self, provider_draft_id: &str) -> mxr_core::provider::Result<()> {
        self.imap.delete_draft(provider_draft_id).await
    }
}

fn validate_current_identity(
    identity: &ImapDraftIdentity,
    current_mailbox: &str,
    current_uid_validity: u32,
) -> mxr_core::provider::Result<()> {
    if identity.mailbox != current_mailbox {
        return Err(MxrError::Provider(format!(
            "IMAP Drafts folder changed from {:?} to {:?}; refusing to target a stale draft identity",
            identity.mailbox, current_mailbox
        )));
    }
    if identity.uid_validity != current_uid_validity {
        return Err(MxrError::Provider(
            ImapProviderError::UidValidityChanged {
                old: identity.uid_validity,
                new: current_uid_validity,
            }
            .to_string(),
        ));
    }
    Ok(())
}

fn snapshot_from_fetched(
    identity: &ImapDraftIdentity,
    message: FetchedMessage,
) -> mxr_core::provider::Result<ServerDraftSnapshot> {
    let raw_rfc822 = message.body.ok_or_else(|| {
        MxrError::Provider(format!(
            "IMAP Drafts FETCH returned no BODY.PEEK[] data for UID {}",
            identity.uid
        ))
    })?;
    let identity_revision =
        folders::format_draft_provider_id(&identity.mailbox, identity.uid_validity, identity.uid);
    let content_digest = Sha256::digest(&raw_rfc822);
    let content_digest = base16ct::lower::encode_string(&content_digest);
    let revision = format!("{identity_revision}:sha256:{content_digest}");
    Ok(ServerDraftSnapshot {
        revision,
        thread_id: None,
        raw_rfc822,
    })
}

async fn build_draft_rfc822(
    draft: &Draft,
    from: &Address,
    message_id: &str,
) -> mxr_core::provider::Result<Vec<u8>> {
    let attachments = mxr_outbound::attachments::load_attachment_paths_async(&draft.attachments)
        .await
        .map_err(|error| MxrError::Provider(format!("Failed to load attachments: {error}")))?;
    let inline_assets = mxr_outbound::attachments::load_inline_assets_async(&draft.inline_assets)
        .await
        .map_err(|error| MxrError::Provider(format!("Failed to load inline assets: {error}")))?;
    let message = mxr_outbound::email::build_message_with_id_and_parts(
        draft,
        from,
        true,
        &attachments,
        &inline_assets,
        message_id,
    )
    .map_err(|error| MxrError::Provider(format!("Failed to build IMAP draft message: {error}")))?;
    Ok(message.formatted())
}

async fn verify_appended_uid(
    session: &mut dyn ImapSession,
    uid: u32,
    message_id: &str,
) -> mxr_core::provider::Result<()> {
    let fetched = session
        .uid_fetch(&uid.to_string(), DRAFT_FETCH_QUERY)
        .await
        .map_err(MxrError::from)?;
    let verified = fetched.into_iter().any(|message| {
        message.uid == uid
            && message
                .body
                .as_deref()
                .is_some_and(|body| message_id_matches(body, message_id))
    });
    if !verified {
        return Err(MxrError::Provider(format!(
            "IMAP APPEND reported UID {uid}, but exact Message-ID verification failed for {message_id}"
        )));
    }
    Ok(())
}

pub(crate) async fn exact_message_id_uids(
    session: &mut dyn ImapSession,
    message_id: &str,
) -> mxr_core::provider::Result<Vec<u32>> {
    let search = message_id_search_query(message_id)?;
    let mut candidates = session.uid_search(&search).await.map_err(MxrError::from)?;
    candidates.sort_unstable();
    candidates.dedup();

    let mut exact_matches = Vec::new();
    for candidate in candidates {
        let fetched = session
            .uid_fetch(&candidate.to_string(), DRAFT_FETCH_QUERY)
            .await
            .map_err(MxrError::from)?;
        if fetched.into_iter().any(|message| {
            message.uid == candidate
                && message
                    .body
                    .as_deref()
                    .is_some_and(|body| message_id_matches(body, message_id))
        }) {
            exact_matches.push(candidate);
        }
    }
    Ok(exact_matches)
}

fn message_id_search_query(message_id: &str) -> mxr_core::provider::Result<String> {
    if message_id.chars().any(char::is_control) {
        return Err(MxrError::Provider(
            "Refusing an IMAP Message-ID search containing control characters".into(),
        ));
    }
    let escaped = message_id.replace('\\', "\\\\").replace('"', "\\\"");
    Ok(format!("HEADER Message-ID \"{escaped}\""))
}

pub(crate) fn message_id_from_rfc822(raw: &[u8]) -> Option<String> {
    mail_parser::MessageParser::default()
        .parse(raw)
        .and_then(|message| message.message_id().map(ToString::to_string))
}

fn deterministic_draft_message_id(draft: &Draft, from: &Address) -> String {
    let digest = Sha256::digest(draft.id.as_str().as_bytes());
    let token = base16ct::lower::encode_string(&digest);
    let domain = from
        .email
        .rsplit_once('@')
        .map_or("localhost", |(_, domain)| domain);
    format!("<mxr-draft-{token}@{domain}>")
}

fn message_id_matches(raw: &[u8], expected: &str) -> bool {
    message_id_from_rfc822(raw)
        .is_some_and(|found| normalize_message_id(&found) == normalize_message_id(expected))
}

fn normalize_message_id(value: &str) -> String {
    value
        .trim()
        .trim_start_matches('<')
        .trim_end_matches('>')
        .to_string()
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::unwrap_used,
        reason = "IMAP draft tests unwrap fixture setup for direct failures"
    )]

    use super::*;
    use crate::config::ImapConfig;
    use crate::session::mock::{CommandLog, MockImapSessionFactory};
    use crate::types::{FolderInfo, ImapCapabilities};
    use async_trait::async_trait;
    use chrono::Utc;
    use mxr_core::id::{AccountId, DraftId};
    use mxr_core::provider::MailSendProvider;
    use mxr_core::types::{DraftContent, DraftIntent};
    use std::ops::Deref;
    use std::sync::{Arc, Mutex};

    fn config() -> ImapConfig {
        ImapConfig::new(
            "imap.test".into(),
            993,
            "test@example.com".into(),
            "test/imap".into(),
            false,
            true,
        )
    }

    fn folder(name: &str, special_use: Option<&str>) -> FolderInfo {
        FolderInfo {
            name: name.into(),
            special_use: special_use.map(str::to_string),
            ..Default::default()
        }
    }

    fn fetched(uid: u32, raw: &[u8]) -> FetchedMessage {
        FetchedMessage {
            uid,
            flags: vec!["\\Draft".into()],
            envelope: None,
            body: Some(raw.to_vec()),
            header: None,
            size: Some(raw.len() as u32),
            internal_date: None,
            gmail_labels: Vec::new(),
            gmail_msg_id: None,
            gmail_thread_id: None,
        }
    }

    fn raw(message_id: &str, body: &str) -> Vec<u8> {
        format!(
            "From: test@example.com\r\nTo: recipient@example.com\r\nMessage-ID: {message_id}\r\nSubject: Draft\r\nContent-Type: text/plain\r\n\r\n{body}"
        )
        .into_bytes()
    }

    struct TestProvider {
        inner: Arc<ImapProvider>,
        log: Arc<Mutex<CommandLog>>,
    }

    impl Deref for TestProvider {
        type Target = ImapProvider;

        fn deref(&self) -> &Self::Target {
            &self.inner
        }
    }

    impl TestProvider {
        fn commands(&self) -> Vec<String> {
            self.log.lock().unwrap().commands.clone()
        }
    }

    fn provider(factory: MockImapSessionFactory) -> TestProvider {
        let log = factory.log.clone();
        TestProvider {
            inner: Arc::new(ImapProvider::with_session_factory(
                AccountId::new(),
                config(),
                Box::new(factory),
            )),
            log,
        }
    }

    fn draft() -> Draft {
        Draft {
            id: DraftId::new(),
            account_id: AccountId::new(),
            from: None,
            reply_headers: None,
            intent: DraftIntent::New,
            to: vec![Address {
                name: None,
                email: "recipient@example.com".into(),
            }],
            cc: Vec::new(),
            bcc: Vec::new(),
            subject: "Draft".into(),
            content: DraftContent::markdown("Body"),
            attachments: Vec::new(),
            inline_assets: Vec::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            inline_calendar_reply: None,
        }
    }

    #[derive(Default)]
    struct NoopSmtp {
        sends: Mutex<Vec<String>>,
    }

    #[async_trait]
    impl MailSendProvider for NoopSmtp {
        fn name(&self) -> &str {
            "test-smtp"
        }

        async fn send(
            &self,
            _draft: &Draft,
            _from: &Address,
            rfc2822_message_id: &str,
        ) -> mxr_core::provider::Result<SendReceipt> {
            self.sends.lock().unwrap().push(rfc2822_message_id.into());
            Ok(SendReceipt {
                provider_message_id: None,
                sent_at: Utc::now(),
                rfc2822_message_id: rfc2822_message_id.into(),
            })
        }
    }

    #[test]
    fn draft_identity_round_trips_mailbox_uidvalidity_and_uid() {
        let id = folders::format_draft_provider_id("Archive:Work/ Drafts", 42, 9001);
        assert_eq!(
            folders::parse_draft_provider_id(&id).unwrap(),
            ImapDraftIdentity {
                mailbox: "Archive:Work/ Drafts".into(),
                uid_validity: 42,
                uid: 9001,
            }
        );
        assert!(folders::parse_draft_provider_id("Drafts:9001").is_err());
    }

    #[tokio::test]
    async fn discovery_uses_actual_special_use_drafts_folder() {
        let actual_folder = "INBOX.Drafts";
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 7,
                uid_next: 20,
                exists: 1,
                highest_modseq: None,
            },
            Vec::new(),
            vec![
                folder("Drafts", None),
                folder(actual_folder, Some("\\Drafts")),
            ],
        )
        .with_uid_search(actual_folder, vec![19]);
        let provider = provider(factory);

        let ids = provider.list_draft_ids().await.unwrap();
        assert_eq!(
            ids,
            vec![folders::format_draft_provider_id(actual_folder, 7, 19)]
        );
        let commands = provider.commands();
        assert!(commands
            .iter()
            .any(|command| command == "SELECT INBOX.Drafts"));
        assert!(commands.iter().any(|command| command == "UID SEARCH ALL"));
        assert!(!commands
            .iter()
            .any(|command| command.starts_with("UID FETCH")));
    }

    #[tokio::test]
    async fn fetch_returns_snapshot_for_current_uid_and_uidvalidity() {
        let actual_folder = "Localized/Drafts";
        let message = raw("<draft-fetch@example.com>", "body");
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 12,
                uid_next: 21,
                exists: 1,
                highest_modseq: None,
            },
            Vec::new(),
            vec![folder(actual_folder, Some("\\Drafts"))],
        )
        .with_mailbox_fetches(actual_folder, vec![vec![fetched(20, &message)]]);
        let provider = provider(factory);
        let id = folders::format_draft_provider_id(actual_folder, 12, 20);

        let snapshot = provider.fetch_draft(&id).await.unwrap().unwrap();
        assert_eq!(snapshot.raw_rfc822, message);
        assert!(snapshot.revision.starts_with(&format!("{id}:sha256:")));
    }

    #[tokio::test]
    async fn missing_special_use_folder_is_an_error_not_empty_discovery() {
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 12,
                uid_next: 1,
                exists: 0,
                highest_modseq: None,
            },
            Vec::new(),
            vec![folder("INBOX", Some("\\Inbox")), folder("Drafts", None)],
        );
        let provider = provider(factory);

        let error = provider.list_draft_ids().await.unwrap_err();
        assert!(error.to_string().contains("no listed SPECIAL-USE"));
    }

    #[tokio::test]
    async fn replacement_without_appenduid_finds_new_uid_before_targeted_old_uid_delete() {
        let actual_folder = "Localized/Drafts";
        let old_message = raw("<replace@example.com>", "old");
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 13,
                uid_next: 22,
                exists: 1,
                highest_modseq: None,
            },
            Vec::new(),
            vec![folder(actual_folder, Some("\\Drafts"))],
        )
        .with_capabilities(ImapCapabilities {
            uidplus: true,
            ..Default::default()
        })
        .with_mailbox_fetches(
            actual_folder,
            vec![
                vec![fetched(21, &old_message)],
                vec![fetched(21, &old_message)],
                vec![fetched(21, &old_message)],
                vec![fetched(21, &old_message)],
                vec![fetched(22, &raw("<replace@example.com>", "new"))],
            ],
        )
        .with_uid_search_responses(actual_folder, vec![vec![21], vec![21], vec![21, 22]]);
        let provider = provider(factory);
        let old_id = folders::format_draft_provider_id(actual_folder, 13, 21);
        let sender = Address {
            name: None,
            email: "test@example.com".into(),
        };

        let replacement_id = provider
            .replace_draft(&old_id, &draft(), &sender)
            .await
            .unwrap();
        assert_eq!(
            replacement_id,
            folders::format_draft_provider_id(actual_folder, 13, 22)
        );
        let commands = provider.commands();
        let append = commands
            .iter()
            .position(|command| command.starts_with("APPEND Localized/Drafts"))
            .unwrap();
        let store = commands
            .iter()
            .position(|command| command == "UID STORE 21 +FLAGS (\\Deleted)")
            .unwrap();
        let expunge = commands
            .iter()
            .position(|command| command == "UID EXPUNGE 21")
            .unwrap();
        assert!(append < store && store < expunge);
    }

    #[tokio::test]
    async fn replacement_refuses_without_uidplus_before_appending() {
        let actual_folder = "Drafts";
        let old_message = raw("<replace-no-uidplus@example.com>", "old");
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 14,
                uid_next: 22,
                exists: 1,
                highest_modseq: None,
            },
            Vec::new(),
            vec![folder(actual_folder, Some("\\Drafts"))],
        )
        .with_mailbox_fetches(actual_folder, vec![vec![fetched(21, &old_message)]]);
        let provider = provider(factory);
        let old_id = folders::format_draft_provider_id(actual_folder, 14, 21);
        let sender = Address {
            name: None,
            email: "test@example.com".into(),
        };

        let error = provider
            .replace_draft(&old_id, &draft(), &sender)
            .await
            .unwrap_err();
        assert!(error.to_string().contains("UIDPLUS"));
        assert!(!provider
            .commands()
            .iter()
            .any(|command| command.starts_with("APPEND ")));
    }
    #[tokio::test]
    async fn fetch_rejects_uidvalidity_mismatch_instead_of_returning_not_found() {
        let actual_folder = "Drafts";
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 8,
                uid_next: 20,
                exists: 1,
                highest_modseq: None,
            },
            Vec::new(),
            vec![folder(actual_folder, Some("\\Drafts"))],
        );
        let provider = provider(factory);
        let stale_id = folders::format_draft_provider_id(actual_folder, 7, 19);

        let error = provider.fetch_draft(&stale_id).await.unwrap_err();
        assert!(error.to_string().contains("UIDVALIDITY changed"));
    }

    #[tokio::test]
    async fn append_without_appenduid_recovers_unique_uid_by_header_and_exact_fetch() {
        let actual_folder = "Localized/Drafts";
        let message_id = "<stable@example.com>";
        let body = raw(message_id, "body");
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 11,
                uid_next: 55,
                exists: 0,
                highest_modseq: None,
            },
            Vec::new(),
            vec![folder(actual_folder, Some("\\Drafts"))],
        )
        .with_mailbox_fetches(actual_folder, vec![vec![fetched(54, &body)]])
        .with_uid_search_responses(actual_folder, vec![vec![], vec![54]]);
        let provider = provider(factory);

        let id = provider.append_draft(&body, message_id).await.unwrap();
        assert_eq!(id, folders::format_draft_provider_id(actual_folder, 11, 54));
    }

    #[tokio::test]
    async fn delete_marks_exact_uid_before_uid_expunge_and_never_plain_expunge() {
        let actual_folder = "Real Drafts";
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 22,
                uid_next: 101,
                exists: 1,
                highest_modseq: None,
            },
            Vec::new(),
            vec![folder(actual_folder, Some("\\Drafts"))],
        )
        .with_capabilities(ImapCapabilities {
            uidplus: true,
            ..Default::default()
        });
        let provider = provider(factory);
        let id = folders::format_draft_provider_id(actual_folder, 22, 100);

        provider.delete_draft(&id).await.unwrap();
        let commands = provider.commands();
        let store = commands
            .iter()
            .position(|command| command == "UID STORE 100 +FLAGS (\\Deleted)")
            .unwrap();
        let expunge = commands
            .iter()
            .position(|command| command == "UID EXPUNGE 100")
            .unwrap();
        assert!(store < expunge);
        assert!(!commands.iter().any(|command| command == "EXPUNGE"));
    }

    #[tokio::test]
    async fn server_draft_send_returns_unknown_when_cleanup_cannot_be_targeted() {
        let actual_folder = "Drafts";
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 32,
                uid_next: 9,
                exists: 1,
                highest_modseq: None,
            },
            Vec::new(),
            vec![folder(actual_folder, Some("\\Drafts"))],
        );
        let provider = provider(factory);
        let smtp = Arc::new(NoopSmtp::default());
        let composite = ImapSmtpSendProvider::new(provider.inner.clone(), smtp.clone());
        let id = folders::format_draft_provider_id(actual_folder, 32, 8);
        let sender = Address {
            name: None,
            email: "test@example.com".into(),
        };

        let error = composite
            .send_server_draft(&id, &draft(), &sender, "<send-unknown@example.com>")
            .await
            .unwrap_err();
        assert!(matches!(error, MxrError::SendOutcomeUnknown(_)));
        assert_eq!(
            smtp.sends.lock().unwrap().as_slice(),
            ["<send-unknown@example.com>"]
        );
        assert!(!provider
            .commands()
            .iter()
            .any(|command| command.starts_with("UID STORE ")));
    }
    #[tokio::test]
    async fn server_draft_send_delegates_smtp_then_deletes_imap_draft() {
        let actual_folder = "Drafts";
        let factory = MockImapSessionFactory::new(
            crate::types::MailboxInfo {
                uid_validity: 31,
                uid_next: 9,
                exists: 1,
                highest_modseq: None,
            },
            Vec::new(),
            vec![folder(actual_folder, Some("\\Drafts"))],
        )
        .with_capabilities(ImapCapabilities {
            uidplus: true,
            ..Default::default()
        });
        let provider = provider(factory);
        let smtp = Arc::new(NoopSmtp::default());
        let composite = ImapSmtpSendProvider::new(provider.inner.clone(), smtp.clone());
        let id = folders::format_draft_provider_id(actual_folder, 31, 8);
        let sender = Address {
            name: None,
            email: "test@example.com".into(),
        };

        composite
            .send_server_draft(&id, &draft(), &sender, "<send@example.com>")
            .await
            .unwrap();
        assert_eq!(
            smtp.sends.lock().unwrap().as_slice(),
            ["<send@example.com>"]
        );
        let commands = provider.commands();
        assert!(commands
            .iter()
            .any(|command| command == "UID STORE 8 +FLAGS (\\Deleted)"));
        assert!(commands.iter().any(|command| command == "UID EXPUNGE 8"));
    }
}

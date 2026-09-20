#![cfg_attr(
    test,
    expect(
        clippy::unwrap_used,
        reason = "tests unwrap fixture setup for direct failures"
    )
)]

use mxr_core::id::{AccountId, LabelId};
use mxr_core::types::{Label, LabelKind, Role};

use crate::error::ImapProviderError;
use crate::types::{FolderInfo, ImapDraftIdentity};

/// Map IMAP folders to mxr labels using RFC 6154 SPECIAL-USE attributes.
pub fn map_folder_to_label(
    folder_name: &str,
    special_use: Option<&str>,
    account_id: &AccountId,
) -> Label {
    let (name, kind, role) = match special_use {
        Some("\\Inbox") => ("INBOX".to_string(), LabelKind::System, Some(Role::Inbox)),
        Some("\\Sent") => ("SENT".to_string(), LabelKind::System, Some(Role::Sent)),
        Some("\\Drafts") => ("DRAFT".to_string(), LabelKind::System, Some(Role::Drafts)),
        Some("\\Trash") => ("TRASH".to_string(), LabelKind::System, Some(Role::Trash)),
        Some("\\Junk" | "\\Spam") => ("SPAM".to_string(), LabelKind::System, Some(Role::Spam)),
        Some("\\Archive") => (
            "ARCHIVE".to_string(),
            LabelKind::System,
            Some(Role::Archive),
        ),
        Some("\\All") => ("ALL".to_string(), LabelKind::System, Some(Role::AllMail)),
        Some("\\Important") => ("IMPORTANT".to_string(), LabelKind::System, None),
        Some("\\Flagged") => (
            "STARRED".to_string(),
            LabelKind::System,
            Some(Role::Starred),
        ),
        _ => (folder_name.to_string(), LabelKind::Folder, None),
    };

    Label {
        id: LabelId::from_scoped_provider_id(account_id, "imap", &name),
        account_id: account_id.clone(),
        name,
        kind,
        color: None,
        provider_id: folder_name.to_string(),
        unread_count: 0,
        total_count: 0,
        role,
    }
}

/// Map Gmail IMAP folders to labels whose provider IDs match X-GM-LABELS.
pub fn map_gmail_folder_to_label(
    folder_name: &str,
    special_use: Option<&str>,
    account_id: &AccountId,
) -> Label {
    let mut label = map_folder_to_label(folder_name, special_use, account_id);
    let fallback_system_provider_id = if special_use.is_none() {
        let leaf = folder_name
            .rsplit_once('/')
            .map_or(folder_name, |(_, leaf)| leaf)
            .to_ascii_lowercase();
        match leaf.as_str() {
            "all mail" | "alle nachrichten" => Some("ALL".to_string()),
            _ => None,
        }
    } else {
        None
    };
    if let Some(system_provider_id) = special_use
        .and_then(normalize_gmail_label_provider_id)
        .or(fallback_system_provider_id)
    {
        label.provider_id = system_provider_id.clone();
        label.id = LabelId::from_scoped_provider_id(account_id, "imap", &system_provider_id);
    } else if folder_name.eq_ignore_ascii_case("inbox") {
        label.provider_id = "INBOX".to_string();
        label.id = LabelId::from_scoped_provider_id(account_id, "imap", "INBOX");
    }
    label
}

/// Provider ID format for IMAP messages: "mailbox:uid" (e.g., "INBOX:12345").
///
/// Drafts deliberately use [`format_draft_provider_id`] instead. A bare
/// mailbox/UID pair is unsafe for a draft because UID values can be reused
/// after UIDVALIDITY changes.
pub fn format_provider_id(mailbox: &str, uid: u32) -> String {
    format!("{mailbox}:{uid}")
}

const DRAFT_PROVIDER_ID_PREFIX: &str = "imap-draft:v1:";

/// Format a versioned IMAP draft identity containing the mailbox, UIDVALIDITY,
/// and UID. The mailbox is percent-encoded so mailbox names containing `:`
/// remain unambiguous.
pub fn format_draft_provider_id(mailbox: &str, uid_validity: u32, uid: u32) -> String {
    format!(
        "{DRAFT_PROVIDER_ID_PREFIX}{}:{uid_validity:010}:{uid:010}",
        encode_mailbox_component(mailbox)
    )
}

/// Parse a versioned IMAP draft identity. Legacy `mailbox:uid` IDs are
/// rejected rather than interpreted with an unknown UIDVALIDITY.
pub fn parse_draft_provider_id(id: &str) -> Result<ImapDraftIdentity, ImapProviderError> {
    let value = id
        .strip_prefix(DRAFT_PROVIDER_ID_PREFIX)
        .ok_or_else(|| ImapProviderError::InvalidProviderId(id.to_string()))?;
    let mut parts = value.split(':');
    let encoded_mailbox = parts
        .next()
        .filter(|mailbox| !mailbox.is_empty())
        .ok_or_else(|| ImapProviderError::InvalidProviderId(id.to_string()))?;
    let uid_validity = parts
        .next()
        .ok_or_else(|| ImapProviderError::InvalidProviderId(id.to_string()))?
        .parse::<u32>()
        .map_err(|_| ImapProviderError::InvalidProviderId(id.to_string()))?;
    let uid = parts
        .next()
        .ok_or_else(|| ImapProviderError::InvalidProviderId(id.to_string()))?
        .parse::<u32>()
        .map_err(|_| ImapProviderError::InvalidProviderId(id.to_string()))?;
    if uid_validity == 0 || uid == 0 {
        return Err(ImapProviderError::InvalidProviderId(id.to_string()));
    }
    if parts.next().is_some() {
        return Err(ImapProviderError::InvalidProviderId(id.to_string()));
    }

    Ok(ImapDraftIdentity {
        mailbox: decode_mailbox_component(encoded_mailbox)
            .ok_or_else(|| ImapProviderError::InvalidProviderId(id.to_string()))?,
        uid_validity,
        uid,
    })
}

/// Resolve the mailbox that owns the account's drafts. RFC 6154 SPECIAL-USE
/// is authoritative. A mailbox name alone is not sufficient authorization for
/// draft mutations because a user-created folder may also be named `Drafts`.
pub fn resolve_drafts_folder(folders: &[FolderInfo]) -> Option<String> {
    folders
        .iter()
        .find(|folder| {
            folder.special_use.as_deref().is_some_and(|value| {
                value
                    .trim()
                    .trim_matches('"')
                    .eq_ignore_ascii_case("\\Drafts")
            })
        })
        .map(|folder| folder.name.clone())
}

fn encode_mailbox_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push('%');
            encoded.push(hex_digit(byte >> 4));
            encoded.push(hex_digit(byte & 0x0f));
        }
    }
    encoded
}

fn decode_mailbox_component(value: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(value.len());
    let mut chars = value.bytes();
    while let Some(byte) = chars.next() {
        if byte != b'%' {
            bytes.push(byte);
            continue;
        }
        let high = chars.next().and_then(hex_value)?;
        let low = chars.next().and_then(hex_value)?;
        bytes.push((high << 4) | low);
    }
    String::from_utf8(bytes)
        .ok()
        .filter(|mailbox| !mailbox.is_empty())
}

fn hex_digit(value: u8) -> char {
    match value {
        0..=9 => (b'0' + value) as char,
        10..=15 => (b'A' + value - 10) as char,
        _ => unreachable!("hex digit is limited to four bits"),
    }
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

/// Normalize Gmail's X-GM-LABELS atoms to mxr provider label IDs.
/// Gmail returns system labels as IMAP atoms like `\\Inbox` and user labels
/// as their display names; mxr's label matching expects stable provider IDs
/// such as `INBOX`, `SENT`, `STARRED`, or the user label name.
pub fn normalize_gmail_label_provider_id(label: &str) -> Option<String> {
    let trimmed = label.trim().trim_matches('"');
    // Gmail returns SYSTEM labels as backslash atoms (`\Sent`) and USER labels
    // as their plain display names. Only match the backslash forms so a user
    // label named "Junk"/"All"/"Flagged" falls through unchanged instead of
    // collapsing onto a system label (which would, e.g., hide mail as SPAM).
    // Bare "inbox" is handled by `map_gmail_folder_to_label`.
    // imap-proto keeps quoted-string escape bytes. Gmail therefore reaches us
    // as either `\Inbox` (atom) or `\\Inbox` (quoted string on the wire).
    let normalized = match trimmed.to_ascii_lowercase().as_str() {
        "\\inbox" | "\\\\inbox" => "INBOX".to_string(),
        "\\sent" | "\\\\sent" => "SENT".to_string(),
        "\\draft" | "\\\\draft" | "\\drafts" | "\\\\drafts" => "DRAFT".to_string(),
        "\\trash" | "\\\\trash" => "TRASH".to_string(),
        "\\spam" | "\\\\spam" | "\\junk" | "\\\\junk" => "SPAM".to_string(),
        "\\flagged" | "\\\\flagged" | "\\starred" | "\\\\starred" => "STARRED".to_string(),
        "\\important" | "\\\\important" => "IMPORTANT".to_string(),
        "\\all" | "\\\\all" | "\\allmail" | "\\\\allmail" => "ALL".to_string(),
        "" => return None,
        _ => trimmed.to_string(),
    };
    Some(normalized)
}

pub fn parse_provider_id(id: &str) -> Result<(String, u32), crate::error::ImapProviderError> {
    let (mailbox, uid_str) = id
        .rsplit_once(':')
        .ok_or_else(|| crate::error::ImapProviderError::InvalidProviderId(id.to_string()))?;
    let uid = uid_str
        .parse()
        .map_err(|_| crate::error::ImapProviderError::InvalidProviderId(id.to_string()))?;
    Ok((mailbox.to_string(), uid))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_to_label_maps_special_use() {
        let aid = AccountId::new();
        let label = map_folder_to_label("INBOX", Some("\\Inbox"), &aid);
        assert_eq!(label.name, "INBOX");
        assert_eq!(label.kind, LabelKind::System);

        let label = map_folder_to_label("Sent Messages", Some("\\Sent"), &aid);
        assert_eq!(label.name, "SENT");

        let label = map_folder_to_label("Junk", Some("\\Junk"), &aid);
        assert_eq!(label.name, "SPAM");

        let label = map_folder_to_label("Archive", Some("\\Archive"), &aid);
        assert_eq!(label.name, "ARCHIVE");

        let label = map_folder_to_label("All Mail", Some("\\All"), &aid);
        assert_eq!(label.name, "ALL");
    }

    #[test]
    fn folder_to_label_custom_folder() {
        let aid = AccountId::new();
        let label = map_folder_to_label("Projects/Work", None, &aid);
        assert_eq!(label.name, "Projects/Work");
        assert_eq!(label.kind, LabelKind::Folder);
    }

    #[test]
    fn same_imap_folder_is_distinct_across_accounts() {
        let first_account = AccountId::from_provider_id("imap", "first@example.com");
        let second_account = AccountId::from_provider_id("imap", "second@example.com");

        let first = map_folder_to_label("INBOX", Some("\\Inbox"), &first_account);
        let second = map_folder_to_label("INBOX", Some("\\Inbox"), &second_account);

        assert_eq!(first.provider_id, second.provider_id);
        assert_ne!(first.account_id, second.account_id);
        assert_ne!(first.id, second.id);
    }

    #[test]
    fn normalize_gmail_label_keeps_user_labels_that_look_like_system_words() {
        // Regression (fix 9): a Gmail USER label named like a system word must
        // pass through unchanged; only backslash atoms map to system labels.
        assert_eq!(
            normalize_gmail_label_provider_id("Junk"),
            Some("Junk".to_string())
        );
        assert_eq!(
            normalize_gmail_label_provider_id("All"),
            Some("All".to_string())
        );
        assert_eq!(
            normalize_gmail_label_provider_id("Flagged"),
            Some("Flagged".to_string())
        );
        // Backslash system atoms still normalize.
        assert_eq!(
            normalize_gmail_label_provider_id("\\Junk"),
            Some("SPAM".to_string())
        );
        assert_eq!(
            normalize_gmail_label_provider_id("\\Sent"),
            Some("SENT".to_string())
        );
        assert_eq!(
            normalize_gmail_label_provider_id("\\\\Inbox"),
            Some("INBOX".to_string())
        );
        assert_eq!(
            normalize_gmail_label_provider_id("\\\\Important"),
            Some("IMPORTANT".to_string())
        );
    }

    #[test]
    fn gmail_all_mail_fallback_folder_uses_canonical_provider_id() {
        let account_id = AccountId::new();

        for folder in ["All Mail", "[Gmail]/All Mail", "[Gmail]/Alle Nachrichten"] {
            let label = map_gmail_folder_to_label(folder, None, &account_id);
            assert_eq!(label.provider_id, "ALL", "folder: {folder}");
        }
    }

    #[test]
    fn provider_id_roundtrip() {
        let id = format_provider_id("INBOX", 12345);
        assert_eq!(id, "INBOX:12345");

        let (mailbox, uid) = parse_provider_id(&id).unwrap();
        assert_eq!(mailbox, "INBOX");
        assert_eq!(uid, 12345);
    }

    #[test]
    fn provider_id_with_nested_folder() {
        let id = format_provider_id("Projects/Work", 42);
        let (mailbox, uid) = parse_provider_id(&id).unwrap();
        assert_eq!(mailbox, "Projects/Work");
        assert_eq!(uid, 42);
    }

    #[test]
    fn provider_id_invalid() {
        assert!(parse_provider_id("no-colon").is_err());
        assert!(parse_provider_id("INBOX:notanumber").is_err());
    }
}

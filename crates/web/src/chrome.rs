use super::envelope_list::{
    list_envelopes, list_envelopes_by_message_ids, run_saved_search, search_envelopes, slugify,
    sorted_saved_searches,
};
use super::*;
use mxr_core::{LabelKind, MessageFlags, SavedSearch, SubscriptionSummary};
use serde_json::json;

#[derive(Debug)]
pub(crate) struct BridgeChrome {
    // Web-specific shaping stays here. The daemon returns reusable runtime data;
    // the bridge assembles shell/sidebar JSON for this client.
    pub(crate) shell: serde_json::Value,
    pub(crate) sidebar: serde_json::Value,
    pub(crate) labels: Vec<Label>,
    pub(crate) inbox_label_id: Option<mxr_core::LabelId>,
    pub(crate) searches: Vec<SavedSearch>,
    pub(crate) subscriptions: Vec<SubscriptionSummary>,
}

#[derive(Debug, Serialize)]
pub(crate) struct MessageLabelView {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) kind: &'static str,
    pub(crate) color: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct MessageRowView {
    pub(crate) id: String,
    pub(crate) kind: &'static str,
    pub(crate) account_id: String,
    pub(crate) thread_id: String,
    pub(crate) provider_id: String,
    pub(crate) sender: String,
    pub(crate) sender_detail: Option<String>,
    pub(crate) subject: String,
    pub(crate) snippet: String,
    pub(crate) date: DateTime<Utc>,
    pub(crate) date_label: String,
    pub(crate) date_full: String,
    pub(crate) date_relative: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) to: Vec<mxr_core::Address>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) cc: Vec<mxr_core::Address>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) bcc: Vec<mxr_core::Address>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) labels: Vec<MessageLabelView>,
    pub(crate) unread: bool,
    pub(crate) starred: bool,
    pub(crate) has_attachments: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) message_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) attachment_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) attachment_filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) attachment_size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) open_commitment_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) triage_verdict: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) triage_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) triage_line: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct MessageGroupView {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) rows: Vec<MessageRowView>,
}

pub(crate) struct MailboxSelection {
    pub(crate) lens_label: String,
    pub(crate) counts: serde_json::Value,
    pub(crate) envelopes: Vec<Envelope>,
}

/// The two lines of chrome the shell shows about sync: a short label and a
/// sentence.
///
/// A degraded status snapshot carries no sync statuses and no message count at
/// all — the daemon answered without reading its database. Every label derived
/// from those fields would then read as "nothing is happening, zero messages",
/// so say the daemon is busy rather than inventing an all-clear.
pub(crate) fn describe_sync_state(
    degraded: bool,
    repair_required: bool,
    sync_statuses: &[mxr_protocol::AccountSyncStatus],
) -> (&'static str, &'static str) {
    if degraded {
        return (
            "Daemon busy",
            "Daemon could not read the database in time — counts are unknown, not empty",
        );
    }
    let label = if sync_statuses.iter().any(|status| status.sync_in_progress) {
        "Syncing"
    } else if sync_statuses
        .iter()
        .any(|status| !status.healthy || status.last_error.is_some())
    {
        "Needs attention"
    } else {
        "Synced"
    };
    let message = if repair_required {
        "Repair required before mailbox opens"
    } else if sync_statuses
        .iter()
        .any(|status| status.last_error.is_some())
    {
        "Last sync needs attention"
    } else {
        "Local-first and ready"
    };
    (label, message)
}

pub(crate) async fn build_bridge_chrome(
    socket_path: &Path,
    active_lens: &MailboxLensRequest,
) -> Result<BridgeChrome, BridgeError> {
    let account_id = active_lens.account_id.clone();
    let (accounts, total_messages, sync_statuses, repair_required, degraded) =
        match ipc_request(socket_path, Request::GetStatus).await? {
            ResponseData::Status {
                accounts,
                total_messages,
                sync_statuses,
                repair_required,
                degraded,
                ..
            } => (
                accounts,
                total_messages,
                sync_statuses,
                repair_required,
                degraded,
            ),
            _ => return Err(BridgeError::UnexpectedResponse),
        };

    let labels = match ipc_request(
        socket_path,
        Request::ListLabels {
            account_id: account_id.clone(),
        },
    )
    .await?
    {
        ResponseData::Labels { labels } => labels
            .into_iter()
            .filter(|label| match account_id.as_ref() {
                Some(account_id) => &label.account_id == account_id,
                None => true,
            })
            .collect::<Vec<_>>(),
        _ => return Err(BridgeError::UnexpectedResponse),
    };

    let searches = match ipc_request(socket_path, Request::ListSavedSearches).await? {
        ResponseData::SavedSearches { searches } => searches
            .into_iter()
            .filter(|search| match account_id.as_ref() {
                Some(account_id) => search
                    .account_id
                    .as_ref()
                    .map_or(true, |search_account_id| search_account_id == account_id),
                None => true,
            })
            .collect::<Vec<_>>(),
        _ => return Err(BridgeError::UnexpectedResponse),
    };

    let subscriptions = match ipc_request(
        socket_path,
        Request::ListSubscriptions {
            account_id: account_id.clone(),
            limit: 8,
        },
    )
    .await?
    {
        ResponseData::Subscriptions { subscriptions } => subscriptions
            .into_iter()
            .filter(|subscription| match account_id.as_ref() {
                Some(account_id) => &subscription.account_id == account_id,
                None => true,
            })
            .collect::<Vec<_>>(),
        _ => return Err(BridgeError::UnexpectedResponse),
    };

    let (sync_label, status_message) =
        describe_sync_state(degraded, repair_required, &sync_statuses);

    Ok(BridgeChrome {
        shell: json!({
            "accountLabel": accounts.first().cloned().unwrap_or_else(|| "local".to_string()),
            "syncLabel": sync_label,
            "statusMessage": status_message,
            "commandHint": "Ctrl-p",
        }),
        sidebar: json!({ "sections": build_sidebar_sections(&labels, &searches, &subscriptions, total_messages, active_lens) }),
        inbox_label_id: find_inbox_label(&labels).map(|label| label.id.clone()),
        labels,
        searches,
        subscriptions,
    })
}

pub(crate) async fn ack_mutation(
    socket_path: &Path,
    mutation: mxr_protocol::MutationCommand,
) -> Result<Json<serde_json::Value>, BridgeError> {
    match ipc_request(socket_path, Request::mutation(mutation)).await? {
        ResponseData::Ack => Ok(Json(serde_json::json!({ "ok": true }))),
        ResponseData::MutationResult { result } => Ok(Json(serde_json::json!({
            "ok": result.succeeded == result.requested && result.skipped == 0 && result.failed == 0,
            "result": result,
        }))),
        _ => Err(BridgeError::UnexpectedResponse),
    }
}

pub(crate) async fn ack_request(
    socket_path: &Path,
    request: Request,
) -> Result<Json<serde_json::Value>, BridgeError> {
    match ipc_request(socket_path, request).await? {
        ResponseData::Ack => Ok(Json(serde_json::json!({ "ok": true }))),
        _ => Err(BridgeError::UnexpectedResponse),
    }
}

pub(crate) fn find_inbox_label(labels: &[Label]) -> Option<&Label> {
    labels
        .iter()
        .find(|label| matches_system_label(label, "Inbox"))
}

pub(crate) fn matches_system_label(label: &Label, expected: &str) -> bool {
    matches!(label.kind, LabelKind::System) && label.name.eq_ignore_ascii_case(expected)
}

pub(crate) fn mailbox_counts(labels: &[Label], envelopes: &[Envelope]) -> serde_json::Value {
    if let Some(inbox) = find_inbox_label(labels) {
        json!({
            "unread": inbox.unread_count,
            "total": inbox.total_count,
        })
    } else {
        json!({
            "unread": envelopes
                .iter()
                .filter(|envelope| !envelope.flags.contains(MessageFlags::READ))
                .count(),
            "total": envelopes.len(),
        })
    }
}

pub(crate) fn derived_counts(envelopes: &[Envelope]) -> serde_json::Value {
    json!({
        "unread": envelopes
            .iter()
            .filter(|envelope| !envelope.flags.contains(MessageFlags::READ))
            .count(),
        "total": envelopes.len(),
    })
}

pub(crate) fn build_sidebar_sections(
    labels: &[Label],
    searches: &[SavedSearch],
    subscriptions: &[SubscriptionSummary],
    total_messages: u32,
    active_lens: &MailboxLensRequest,
) -> Vec<serde_json::Value> {
    let all_mail_total = labels
        .iter()
        .find(|label| matches_system_label(label, "All Mail"))
        .map(|label| label.total_count)
        .unwrap_or_else(|| {
            if active_lens.account_id.is_some() {
                0
            } else {
                total_messages
            }
        });
    let all_mail_unread = labels
        .iter()
        .find(|label| matches_system_label(label, "All Mail"))
        .map(|label| label.unread_count)
        .unwrap_or_default();

    let mut system_items = Vec::new();
    for name in ["Inbox", "Starred", "Sent", "Drafts", "Spam", "Trash"] {
        if let Some(label) = labels
            .iter()
            .find(|label| matches_system_label(label, name))
        {
            system_items.push(json!({
                "id": slugify(&label.name),
                "label": label.name,
                "account_id": label.account_id,
                "unread": label.unread_count,
                "total": label.total_count,
                "active": active_lens.kind == MailboxLensKind::Label
                    && active_lens.label_id.as_deref() == Some(&label.id.to_string())
                    || active_lens.kind == MailboxLensKind::Inbox && name == "Inbox",
                "lens": {
                    "kind": if name == "Inbox" { "inbox" } else { "label" },
                    "accountId": label.account_id,
                    "dropAction": match name {
                        "Spam" => Some("spam"),
                        "Trash" => Some("trash"),
                        _ => None,
                    },
                    "labelId": if name == "Inbox" {
                        None::<String>
                    } else {
                        Some(label.id.to_string())
                    },
                },
            }));
        }
    }
    system_items.push(json!({
        "id": "all-mail",
        "label": "All Mail",
        "unread": all_mail_unread,
        "total": all_mail_total,
        "active": active_lens.kind == MailboxLensKind::AllMail,
        "lens": { "kind": "all_mail" },
    }));

    let user_labels = labels
        .iter()
        .filter(|label| !matches!(label.kind, LabelKind::System))
        .map(|label| {
            json!({
                "id": slugify(&label.name),
                "label": label.name,
                "account_id": label.account_id,
                "unread": label.unread_count,
                "total": label.total_count,
                "active": active_lens.kind == MailboxLensKind::Label
                    && active_lens.label_id.as_deref() == Some(&label.id.to_string()),
                "lens": {
                    "kind": "label",
                    "labelId": label.id.to_string(),
                    "accountId": label.account_id,
                },
            })
        })
        .collect::<Vec<_>>();

    let saved_search_items = sorted_saved_searches(searches.to_vec())
        .into_iter()
        .map(|search| {
            json!({
                "id": format!("saved-search-{}", slugify(&search.name)),
                "label": search.name,
                "unread": 0,
                "total": 0,
                "active": active_lens.kind == MailboxLensKind::SavedSearch
                    && active_lens.saved_search.as_deref() == Some(search.name.as_str()),
                "lens": {
                    "kind": "saved_search",
                    "savedSearch": search.name,
                },
            })
        })
        .collect::<Vec<_>>();

    system_items.push(json!({
        "id": "subscriptions",
        "label": "Subscriptions",
        "unread": subscriptions
            .iter()
            .filter(|subscription| !subscription.latest_flags.contains(MessageFlags::READ))
            .count(),
        "total": subscriptions.len(),
        "active": active_lens.kind == MailboxLensKind::Subscription,
        "lens": { "kind": "subscription" },
    }));

    let mut sections = vec![json!({
        "id": "system",
        "title": "System",
        "items": system_items,
    })];
    if !user_labels.is_empty() {
        sections.push(json!({
            "id": "labels",
            "title": "Labels",
            "items": user_labels,
        }));
    }
    if !saved_search_items.is_empty() {
        sections.push(json!({
            "id": "saved-searches",
            "title": "Saved Searches",
            "items": saved_search_items,
        }));
    }
    sections
}

pub(crate) async fn load_mailbox_selection(
    socket_path: &Path,
    chrome: &BridgeChrome,
    lens: &MailboxLensRequest,
    limit: u32,
    offset: u32,
) -> Result<MailboxSelection, BridgeError> {
    match lens.kind {
        MailboxLensKind::Inbox => {
            let envelopes = list_envelopes(
                socket_path,
                chrome.inbox_label_id.clone(),
                lens.account_id.as_ref(),
                limit,
                offset,
            )
            .await?;
            Ok(MailboxSelection {
                lens_label: find_inbox_label(&chrome.labels)
                    .map_or_else(|| "Inbox".to_string(), |label| label.name.clone()),
                counts: mailbox_counts(&chrome.labels, &envelopes),
                envelopes,
            })
        }
        MailboxLensKind::AllMail => {
            let envelopes =
                list_envelopes(socket_path, None, lens.account_id.as_ref(), limit, offset).await?;
            let counts = chrome
                .labels
                .iter()
                .find(|label| matches_system_label(label, "All Mail"))
                .map_or_else(
                    || derived_counts(&envelopes),
                    |label| {
                        json!({
                            "unread": label.unread_count,
                            "total": label.total_count,
                        })
                    },
                );
            Ok(MailboxSelection {
                lens_label: "All Mail".to_string(),
                counts,
                envelopes,
            })
        }
        MailboxLensKind::Label => {
            let label_id = lens
                .label_id
                .as_deref()
                .ok_or_else(|| BridgeError::Ipc("label lens missing label_id".into()))
                .and_then(parse_label_id)?;
            let label = chrome
                .labels
                .iter()
                .find(|candidate| candidate.id == label_id)
                .ok_or_else(|| {
                    BridgeError::Ipc(format!(
                        "label {label_id} is not available for the requested account"
                    ))
                })?;
            if lens
                .account_id
                .as_ref()
                .is_some_and(|account_id| &label.account_id != account_id)
            {
                return Err(BridgeError::Ipc(format!(
                    "label {label_id} is not available for the requested account"
                )));
            }
            let envelopes = list_envelopes(
                socket_path,
                Some(label_id),
                lens.account_id.as_ref(),
                limit,
                offset,
            )
            .await?;
            Ok(MailboxSelection {
                lens_label: label.name.clone(),
                counts: json!({
                    "unread": label.unread_count,
                    "total": label.total_count,
                }),
                envelopes,
            })
        }
        MailboxLensKind::SavedSearch => {
            let name = lens
                .saved_search
                .as_deref()
                .ok_or_else(|| BridgeError::Ipc("saved search lens missing saved_search".into()))?;
            let search = chrome
                .searches
                .iter()
                .find(|search| search.name == name)
                .ok_or_else(|| {
                    BridgeError::Ipc(format!(
                        "saved search '{name}' is not available for the requested account"
                    ))
                })?;
            let envelopes =
                run_saved_search(socket_path, &search.name, lens.account_id.as_ref(), limit)
                    .await?;
            Ok(MailboxSelection {
                lens_label: search.name.clone(),
                counts: derived_counts(&envelopes),
                envelopes,
            })
        }
        MailboxLensKind::Subscription => {
            if let Some(sender_email) = lens.sender_email.as_deref() {
                // A subscription drilldown is a sender search; `Request::Search`
                // supports offset, so this lens paginates (unlike the saved-search
                // and subscription-overview lenses, whose IPC variants take no
                // offset).
                let envelopes = search_envelopes(
                    socket_path,
                    sender_email,
                    lens.account_id.as_ref(),
                    limit,
                    offset,
                )
                .await?;
                return Ok(MailboxSelection {
                    lens_label: chrome
                        .subscriptions
                        .iter()
                        .find(|subscription| subscription.sender_email == sender_email)
                        .and_then(|subscription| subscription.sender_name.clone())
                        .unwrap_or_else(|| sender_email.to_string()),
                    counts: derived_counts(&envelopes),
                    envelopes,
                });
            }

            let message_ids = chrome
                .subscriptions
                .iter()
                .take(limit as usize)
                .map(|subscription| subscription.latest_message_id.clone())
                .collect::<Vec<_>>();
            let envelopes =
                list_envelopes_by_message_ids(socket_path, &message_ids, lens.account_id.as_ref())
                    .await?;
            Ok(MailboxSelection {
                lens_label: "Subscriptions".to_string(),
                counts: json!({
                    "unread": chrome
                        .subscriptions
                        .iter()
                        .filter(|subscription| !subscription.latest_flags.contains(MessageFlags::READ))
                        .count(),
                    "total": chrome.subscriptions.len(),
                }),
                envelopes,
            })
        }
    }
}

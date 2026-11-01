//! apps/relay-server/src/crdt.rs
//! Hybrid Logical Clock (HLC) LWW-Element-Set CRDT Comparator
//! Matches `@vaultguard/crypto/syncClient.ts` `shouldIncomingSyncItemWin` logic.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HlcTimestamp {
    pub wall_time_ms: i64,
    pub counter: u16,
    pub device_id: String,
}

/// Parses `<15-digit-wallTimeMs>:<4-hex-counter>:<deviceId>`
pub fn parse_hlc_timestamp(raw: &str) -> Option<HlcTimestamp> {
    let parts: Vec<&str> = raw.splitn(3, ':').collect();
    if parts.len() != 3 {
        return None;
    }

    let wall_time_ms = parts[0].parse::<i64>().ok()?;
    let counter = u16::from_str_radix(parts[1], 16).ok()?;
    let device_id = parts[2].trim();

    if wall_time_ms < 0 || device_id.is_empty() {
        return None;
    }

    Some(HlcTimestamp {
        wall_time_ms,
        counter,
        device_id: device_id.to_string(),
    })
}

#[derive(Debug, Clone)]
pub struct SyncItemRecord {
    pub item_id: String,
    pub revision: i64,
    pub nonce_base64: String,
    pub ciphertext_base64: String,
    pub hlc_timestamp: String,
    pub deleted_at: Option<i64>,
    pub updated_at: i64,
}

/// Deterministic HLC LWW-Element-Set CRDT comparator
pub fn should_incoming_sync_item_win(
    incoming: &SyncItemRecord,
    existing: &SyncItemRecord,
) -> bool {
    let inc_hlc = parse_hlc_timestamp(&incoming.hlc_timestamp);
    let ext_hlc = parse_hlc_timestamp(&existing.hlc_timestamp);

    if let (Some(inc), Some(ext)) = (inc_hlc, ext_hlc) {
        if inc.wall_time_ms != ext.wall_time_ms {
            return inc.wall_time_ms > ext.wall_time_ms;
        }
        if inc.counter != ext.counter {
            return inc.counter > ext.counter;
        }
        if inc.device_id != ext.device_id {
            return inc.device_id > ext.device_id;
        }
    }

    if incoming.revision != existing.revision {
        return incoming.revision > existing.revision;
    }

    // Tombstone wins over active update
    if incoming.deleted_at.is_some() && existing.deleted_at.is_none() {
        return true;
    }
    if incoming.deleted_at.is_none() && existing.deleted_at.is_some() {
        return false;
    }

    incoming.updated_at > existing.updated_at
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hlc_parser() {
        let parsed = parse_hlc_timestamp("000173000000000:000a:device_abc").unwrap();
        assert_eq!(parsed.wall_time_ms, 173000000000);
        assert_eq!(parsed.counter, 10);
        assert_eq!(parsed.device_id, "device_abc");
    }

    #[test]
    fn test_crdt_wall_time_wins() {
        let item1 = SyncItemRecord {
            item_id: "id1".into(),
            revision: 1,
            nonce_base64: "n".into(),
            ciphertext_base64: "c".into(),
            hlc_timestamp: "000173000000000:0000:dev1".into(),
            deleted_at: None,
            updated_at: 100,
        };
        let item2 = SyncItemRecord {
            item_id: "id1".into(),
            revision: 1,
            nonce_base64: "n".into(),
            ciphertext_base64: "c".into(),
            hlc_timestamp: "000173000000001:0000:dev1".into(),
            deleted_at: None,
            updated_at: 101,
        };
        assert!(should_incoming_sync_item_win(&item2, &item1));
        assert!(!should_incoming_sync_item_win(&item1, &item2));
    }

    #[test]
    fn test_crdt_tombstone_wins_on_equal_timestamp() {
        let active = SyncItemRecord {
            item_id: "id1".into(),
            revision: 2,
            nonce_base64: "n".into(),
            ciphertext_base64: "c".into(),
            hlc_timestamp: "000173000000000:0000:dev1".into(),
            deleted_at: None,
            updated_at: 100,
        };
        let tombstone = SyncItemRecord {
            item_id: "id1".into(),
            revision: 2,
            nonce_base64: "n".into(),
            ciphertext_base64: "c".into(),
            hlc_timestamp: "000173000000000:0000:dev1".into(),
            deleted_at: Some(100),
            updated_at: 100,
        };
        assert!(should_incoming_sync_item_win(&tombstone, &active));
        assert!(!should_incoming_sync_item_win(&active, &tombstone));
    }
}

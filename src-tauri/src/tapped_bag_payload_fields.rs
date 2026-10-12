// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! A tapped bag's payload — one msgpack value of any shape — as the window shows it: a map's
//! fields in the payload's own order, each as `[key, display text]`, a nested map as
//! `key=value key=value` and an array as `[a, b]`; and the surface id a frame bag names.

use std::fmt;

use rmpv::Value;

/// The payload field a frame bag names its frame by.
const SURFACE_ID_PAYLOAD_FIELD_NAME: &str = "surface_id";

/// The one field a payload that is not a map shows, holding the whole value.
const WHOLE_PAYLOAD_FIELD_NAME: &str = "payload";

/// The most items of an array, or entries of a nested map, one display text spells out.
const DISPLAYED_ITEM_LIMIT: usize = 16;

/// The most characters one display text keeps.
const DISPLAYED_CHARACTER_LIMIT: usize = 512;

/// The msgpack value a bag's payload holds; refused when the payload is not msgpack.
pub fn decode_tapped_bag_payload(payload: &[u8]) -> Result<Value, String> {
    let mut unread_payload = payload;
    rmpv::decode::read_value(&mut unread_payload)
        .map_err(|failure| format!("the bag's payload is not msgpack: {failure}"))
}

/// The payload's fields as the window shows them: a map's entries in order, or one field named
/// `payload` holding a value of any other shape.
pub fn displayed_payload_fields(payload: &Value) -> Vec<(String, String)> {
    match payload {
        Value::Map(entries) => entries
            .iter()
            .map(|(key, value)| (displayed_map_key(key), displayed_field_value(value)))
            .collect(),
        whole_payload => vec![(
            WHOLE_PAYLOAD_FIELD_NAME.to_string(),
            displayed_field_value(whole_payload),
        )],
    }
}

/// The surface id a frame bag names in its `surface_id` field; a repeated field reads as its last
/// entry, as a decoded map keeps it, and a field that is not a string names none.
pub fn surface_id_named_by_the_payload(payload: &Value) -> Option<String> {
    let Value::Map(entries) = payload else {
        return None;
    };
    entries
        .iter()
        .rev()
        .find(|(key, _)| key.as_str() == Some(SURFACE_ID_PAYLOAD_FIELD_NAME))
        .and_then(|(_, value)| value.as_str())
        .map(str::to_string)
}

/// Where a value sits: a field's own value spells a map bare, and a value inside another one, or
/// an empty map, braces it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DisplayedValuePlace {
    FieldValue,
    InsideAnotherValue,
}

/// A payload value spelled compactly: text as it is, a binary or extension value by its size, an
/// array or nested map by its first [`DISPLAYED_ITEM_LIMIT`] items.
struct DisplayedPayloadValue<'value> {
    value: &'value Value,
    place: DisplayedValuePlace,
}

impl fmt::Display for DisplayedPayloadValue<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.value {
            Value::Nil => formatter.write_str("null"),
            Value::Boolean(boolean) => write!(formatter, "{boolean}"),
            Value::Integer(integer) => write!(formatter, "{integer}"),
            Value::F32(number) => write!(formatter, "{number}"),
            Value::F64(number) => write!(formatter, "{number}"),
            Value::String(text) => match text.as_str() {
                Some(text) => formatter.write_str(text),
                None => formatter.write_str(&String::from_utf8_lossy(text.as_bytes())),
            },
            Value::Binary(bytes) => write!(formatter, "<{} bytes>", bytes.len()),
            Value::Ext(extension_type, bytes) => {
                write!(formatter, "<ext {extension_type}, {} bytes>", bytes.len())
            }
            Value::Array(items) => {
                formatter.write_str("[")?;
                for (item_index, item) in items.iter().take(DISPLAYED_ITEM_LIMIT).enumerate() {
                    if item_index > 0 {
                        formatter.write_str(", ")?;
                    }
                    write!(formatter, "{}", displayed_inside_another_value(item))?;
                }
                if items.len() > DISPLAYED_ITEM_LIMIT {
                    write!(formatter, ", … {} more", items.len() - DISPLAYED_ITEM_LIMIT)?;
                }
                formatter.write_str("]")
            }
            Value::Map(entries) => {
                let braced =
                    self.place == DisplayedValuePlace::InsideAnotherValue || entries.is_empty();
                if braced {
                    formatter.write_str("{")?;
                }
                for (entry_index, (key, value)) in
                    entries.iter().take(DISPLAYED_ITEM_LIMIT).enumerate()
                {
                    if entry_index > 0 {
                        formatter.write_str(" ")?;
                    }
                    write!(
                        formatter,
                        "{}={}",
                        displayed_inside_another_value(key),
                        displayed_inside_another_value(value)
                    )?;
                }
                if entries.len() > DISPLAYED_ITEM_LIMIT {
                    write!(
                        formatter,
                        " … {} more",
                        entries.len() - DISPLAYED_ITEM_LIMIT
                    )?;
                }
                if braced {
                    formatter.write_str("}")?;
                }
                Ok(())
            }
        }
    }
}

fn displayed_inside_another_value(value: &Value) -> DisplayedPayloadValue<'_> {
    DisplayedPayloadValue {
        value,
        place: DisplayedValuePlace::InsideAnotherValue,
    }
}

/// A map key as text: a string as it is, any other key spelled as a value.
fn displayed_map_key(key: &Value) -> String {
    displayed_text_within_the_character_limit(displayed_inside_another_value(key).to_string())
}

fn displayed_field_value(value: &Value) -> String {
    displayed_text_within_the_character_limit(
        DisplayedPayloadValue {
            value,
            place: DisplayedValuePlace::FieldValue,
        }
        .to_string(),
    )
}

/// `displayed_text` cut to [`DISPLAYED_CHARACTER_LIMIT`] characters, ending in `…` when cut.
fn displayed_text_within_the_character_limit(mut displayed_text: String) -> String {
    if let Some((cut_at_byte, _)) = displayed_text.char_indices().nth(DISPLAYED_CHARACTER_LIMIT) {
        displayed_text.truncate(cut_at_byte);
        displayed_text.push('…');
    }
    displayed_text
}

#[cfg(test)]
mod tests {
    use super::*;

    fn named_map(entries: Vec<(&str, Value)>) -> Value {
        Value::Map(
            entries
                .into_iter()
                .map(|(key, value)| (Value::from(key), value))
                .collect(),
        )
    }

    fn msgpack_bytes_of(value: &Value) -> Vec<u8> {
        let mut msgpack_bytes = Vec::new();
        rmpv::encode::write_value(&mut msgpack_bytes, value).unwrap();
        msgpack_bytes
    }

    fn fields(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(key, display_text)| (key.to_string(), display_text.to_string()))
            .collect()
    }

    /// A video frame bag's payload, as a real runtime's `InvertingEffect` published it.
    fn a_video_frame_payload() -> Value {
        named_map(vec![
            (
                "surface_id",
                Value::from("e17a285e-5861-495a-91fe-30dd9d97c5e5#72517"),
            ),
            ("width", Value::from(1280)),
            ("height", Value::from(720)),
            ("timestamp_ns", Value::from(3527313234384708u64)),
            (
                "color_info",
                named_map(vec![
                    ("primaries", Value::from("bt709")),
                    ("transfer", Value::from("srgb")),
                    ("range", Value::from("full")),
                ]),
            ),
        ])
    }

    #[test]
    fn a_frame_bags_fields_keep_their_order_and_name_its_surface() {
        let payload =
            decode_tapped_bag_payload(&msgpack_bytes_of(&a_video_frame_payload())).unwrap();

        assert_eq!(
            displayed_payload_fields(&payload),
            fields(&[
                ("surface_id", "e17a285e-5861-495a-91fe-30dd9d97c5e5#72517"),
                ("width", "1280"),
                ("height", "720"),
                ("timestamp_ns", "3527313234384708"),
                ("color_info", "primaries=bt709 transfer=srgb range=full"),
            ])
        );
        assert_eq!(
            surface_id_named_by_the_payload(&payload).as_deref(),
            Some("e17a285e-5861-495a-91fe-30dd9d97c5e5#72517")
        );
    }

    #[test]
    fn every_msgpack_shape_has_a_compact_display_text() {
        let payload = named_map(vec![
            ("nothing", Value::Nil),
            ("ready", Value::from(true)),
            ("gain", Value::F32(0.5)),
            ("level", Value::F64(-1.25)),
            ("offset", Value::from(-3)),
            ("samples", Value::Binary(vec![0; 4096])),
            ("tagged", Value::Ext(7, vec![1, 2, 3])),
            (
                "channels",
                Value::Array(vec![
                    Value::from("left"),
                    named_map(vec![
                        ("name", Value::from("right")),
                        ("muted", Value::from(false)),
                    ]),
                    Value::Array(vec![Value::from(1), Value::from(2)]),
                ]),
            ),
            (
                "nested",
                named_map(vec![("inner", named_map(vec![("depth", Value::from(2))]))]),
            ),
            ("empty_list", Value::Array(Vec::new())),
            ("empty_map", Value::Map(Vec::new())),
        ]);

        assert_eq!(
            displayed_payload_fields(&payload),
            fields(&[
                ("nothing", "null"),
                ("ready", "true"),
                ("gain", "0.5"),
                ("level", "-1.25"),
                ("offset", "-3"),
                ("samples", "<4096 bytes>"),
                ("tagged", "<ext 7, 3 bytes>"),
                ("channels", "[left, {name=right muted=false}, [1, 2]]"),
                ("nested", "inner={depth=2}"),
                ("empty_list", "[]"),
                ("empty_map", "{}"),
            ])
        );
    }

    #[test]
    fn a_long_array_map_or_text_is_cut_short() {
        let payload = named_map(vec![
            ("samples", Value::Array((0..40).map(Value::from).collect())),
            (
                "settings",
                Value::Map(
                    (0..20)
                        .map(|index| (Value::from(format!("k{index}")), Value::from(index)))
                        .collect(),
                ),
            ),
            ("note", Value::from("ab".repeat(400))),
        ]);

        let displayed = displayed_payload_fields(&payload);

        assert_eq!(
            displayed[0].1,
            "[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, … 24 more]"
        );
        assert!(
            displayed[1].1.ends_with("k15=15 … 4 more"),
            "{}",
            displayed[1].1
        );
        assert_eq!(
            displayed[2].1.chars().count(),
            DISPLAYED_CHARACTER_LIMIT + 1
        );
        assert!(displayed[2].1.ends_with("ab…"), "{}", displayed[2].1);
    }

    #[test]
    fn a_payload_that_is_not_a_map_is_one_field_and_names_no_surface() {
        let payload = Value::Array(vec![Value::from(0.25), Value::from(-0.25)]);

        assert_eq!(
            displayed_payload_fields(&payload),
            fields(&[("payload", "[0.25, -0.25]")])
        );
        assert_eq!(surface_id_named_by_the_payload(&payload), None);
    }

    #[test]
    fn a_map_key_that_is_not_text_is_spelled_as_a_value() {
        let payload = Value::Map(vec![(Value::from(7), Value::from("seven"))]);

        assert_eq!(
            displayed_payload_fields(&payload),
            fields(&[("7", "seven")])
        );
    }

    #[test]
    fn a_repeated_surface_id_reads_as_its_last_entry_and_one_that_is_not_text_names_none() {
        let repeated = named_map(vec![
            ("surface_id", Value::from("s#1")),
            ("surface_id", Value::from("s#2")),
        ]);
        assert_eq!(
            surface_id_named_by_the_payload(&repeated).as_deref(),
            Some("s#2")
        );
        assert_eq!(
            displayed_payload_fields(&repeated),
            fields(&[("surface_id", "s#1"), ("surface_id", "s#2")])
        );

        for not_text in [Value::from(7), Value::Binary(b"s#1".to_vec())] {
            assert_eq!(
                surface_id_named_by_the_payload(&named_map(vec![("surface_id", not_text)])),
                None
            );
        }
    }

    #[test]
    fn bytes_that_are_not_one_whole_msgpack_value_are_refused() {
        for not_msgpack in [&[][..], &[0xd9, 0x05, b'a'][..]] {
            let failure = decode_tapped_bag_payload(not_msgpack).unwrap_err();

            assert!(
                failure.starts_with("the bag's payload is not msgpack"),
                "{failure}"
            );
        }
    }
}

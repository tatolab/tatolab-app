// JSON text of what the Studio reads from the runtime, whose whole numbers may be `bigint`s.

/** `member` as JSON text, a `bigint` written as its digits; `undefined` for what JSON leaves out, as `JSON.stringify` answers. */
function jsonTextOfAMember(member: unknown): string | undefined {
  if (typeof member === "bigint") return member.toString();
  if (Array.isArray(member)) return `[${member.map((item: unknown) => jsonTextOfAMember(item) ?? "null").join(",")}]`;
  if (typeof member === "object" && member !== null) {
    const fields = Object.entries(member).flatMap(([key, field]) => {
      const fieldText = jsonTextOfAMember(field);
      return fieldText === undefined ? [] : [`${JSON.stringify(key)}:${fieldText}`];
    });
    return `{${fields.join(",")}}`;
  }
  const primitiveText: string | undefined = JSON.stringify(member);
  return primitiveText;
}

/**
 * `value` as compact JSON text, each `bigint` written as its digits, and `null` for a value JSON leaves out. The contract
 * types a whole number the runtime may write past `Number.MAX_SAFE_INTEGER` as `number | bigint`, such as a graph node's
 * `config_checksum` or an integer pin's value, which `JSON.stringify` throws on; so a reading, or a value one holds, is
 * written as JSON text by this, to compare it with another or to show it.
 */
export function jsonTextOf(value: unknown): string {
  return jsonTextOfAMember(value) ?? "null";
}

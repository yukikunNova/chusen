/** 会議チャットに貼る用の結果テキスト。 */
export function formatResult(names: readonly string[]): string {
  return names.map((name, i) => `${i + 1}. ${name}`).join('\n');
}

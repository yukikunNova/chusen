import type { Rand } from './prng';
import type { AttackItem, RaceEventKind, RaceScript } from './race-script';

export type CommentaryKind = RaceEventKind | 'start' | 'finish';
export type Cue = { t: number; text: string };

const START_TIME = 0.5;

/** 攻撃アイテムの表示名。 */
export const ITEM_NAMES: Record<AttackItem, string> = {
  missile: '仕様変更ミサイル',
  bomb: '長文メール爆弾',
  thunder: '差し戻しサンダー',
};

/** 実況文。'{name}' を名前（攻撃では被弾者）に、'{from}' を攻撃者に、'{item}' をアイテム名に置き換える。 */
export const TEMPLATES: Record<CommentaryKind, readonly string[]> = {
  start: [
    '全宇宙が見守る中、発表順を賭けた戦いが今始まる！',
    'たかが発表順、されど発表順。銀河グランプリ開幕！',
    '本日のメインイベント、発表順決定戦！ 各機エンジン全開！',
    '誰もトップバッターにはなりたくない…はず！ 運命のスタートです！',
  ],
  slowStart: [
    '{name}、謎の出遅れ！ まだ心の準備ができていない！',
    'おっと{name}、スタートで二度寝か！？',
    '{name}、エンジンがかからない！ 発表資料もまだか！？',
    '{name}、出遅れた！ ミュート解除に手間取ったか！',
  ],
  rocketStart: [
    '{name}、完璧なロケットスタート！ やる気が怖い！',
    '{name}が飛び出した！ そんなに早く発表したいのか！',
    '{name}、フライング気味の好発進！',
    'スタート直後、{name}がいきなり先頭へ！',
  ],
  boost: [
    '{name}、ここでブースト点火！ 残業パワー全開！',
    '{name}が加速！ コーヒー3杯目の力か！',
    '{name}、謎の加速！ 締切前の集中力だ！',
    'おおっと{name}、急にやる気を出した！',
  ],
  spin: [
    '{name}、まさかのスピン！ 目が回っている！',
    '{name}、回っている！ 回りすぎている！',
    'あーっと{name}、華麗に3回転！ 採点競技ではありません！',
    '{name}、スピン！ 議題を見失ったか！',
  ],
  weave: [
    '{name}、蛇行運転！ 話が脱線しています！',
    '{name}、フラフラしている！ 昼食後の眠気か！',
    '{name}、進路が定まらない！ 結論から話してほしい！',
    '{name}、右へ左へ！ 迷走が止まらない！',
  ],
  stall: [
    '{name}、謎の失速！ Wi-Fiが切れたか！？',
    '{name}、止まった！ 画面が固まっています！',
    'どうした{name}、急ブレーキ！「すみません、聞こえてますか？」',
    '{name}、ガス欠か！ 進捗どうですか！',
  ],
  overtake: [
    '{name}、ごぼう抜き！ 誰も止められない！',
    '{name}が外から一気に来た！',
    '{name}、鮮やかな追い抜き！ 根回しが効いている！',
    '{name}、するすると順位を上げる！',
  ],
  attack: [
    '{from}の{item}が{name}に直撃！ 容赦がない！',
    '{from}、{item}を発射！ {name}が吹き飛んだ！',
    '{name}、{from}の{item}を食らってスピン！',
    'なんと{from}が{item}！ 狙われたのは{name}だ！',
  ],
  finalComeback: [
    '最終コーナー、{name}が来た！ {name}が来たァ！',
    '大外から{name}！ とんでもない末脚だ！',
    'ここで{name}が覚醒！ 後方から一気にまくる！',
    '信じられない！ {name}が全員まとめて抜き去る！',
  ],
  finish: [
    'ゴール！！ 栄光のトップバッターは {name}！',
    '決まったァ！ 1番手は {name}！ おめでとうございます！',
    '{name}、1着でゴール！ 発表の準備をお願いします！',
    '優勝は {name}！ 賞品は「最初に発表する権利」です！',
  ],
};

type LineValues = { name: string; from?: string; item?: string };

function line(kind: CommentaryKind, values: LineValues, rand: Rand): string {
  const options = TEMPLATES[kind];
  const template = options[Math.min(options.length - 1, Math.floor(rand() * options.length))]!;
  // 関数で 1 回だけ置き換える。名前に含まれる '$&' や '{name}' は解釈しない
  return template.replace(
    /\{(name|from|item)\}/g,
    (_match, key: keyof LineValues) => values[key] ?? '',
  );
}

/** 台本から実況キューを作る。開幕 1 本 + イベントごとに 1 本 + ゴール 1 本。 */
export function buildCommentary(script: RaceScript, rand: Rand): Cue[] {
  const nameOf = (racer: number) => script.racers[racer]?.name ?? '';
  const cues: Cue[] = [{ t: START_TIME, text: line('start', { name: '' }, rand) }];
  for (const event of script.events) {
    const values: LineValues = { name: nameOf(event.racer) };
    if (event.from !== undefined) values.from = nameOf(event.from);
    if (event.item !== undefined) values.item = ITEM_NAMES[event.item];
    cues.push({ t: event.t, text: line(event.kind, values, rand) });
  }
  const winner = script.racers[0];
  if (winner) {
    cues.push({ t: winner.finishTime, text: line('finish', { name: winner.name }, rand) });
  }
  return cues;
}

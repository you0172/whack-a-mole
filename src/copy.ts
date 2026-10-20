/**
 * All player-facing copy in one place (PRD N5: ship zh-CN only, but keep the
 * strings externalised so another language is a data change, not a code change).
 */
export const copy = {
  brand: '打地鼠',
  tagline: '60 秒，九个洞',

  hud: {
    score: '分数',
    combo: '连击',
    level: '等级',
    best: '最佳',
    time: '剩余',
    goal: '本局目标',
    goalDone: '已达成',
  },

  start: {
    eyebrow: '准备好了吗',
    title: '见鼠就打，见炸弹就忍',
    body: '点一下，或者按 1–9。金鼠 5 倍分，炸弹扣分并清零连击。',
    action: '开始',
    actionAgain: '再来一局',
  },

  paused: {
    eyebrow: '已暂停',
    title: '喘口气',
    body: (score: string) => `当前 ${score} 分。按 P 或点按钮继续。`,
    action: '继续',
  },

  result: {
    eyebrowNewBest: '新纪录',
    eyebrow: '时间到',
    title: (score: string) => `本局 ${score} 分`,
    subtitleNewBest: '这是你最好的一次。还能更快吗？',
    subtitle: (best: string) => `历史最佳 ${best} 分，差一点。`,
    action: '再来一局',
    rows: {
      score: '本局得分',
      record: '是否破纪录',
      combo: '最高连击',
      goal: '本局目标',
      golden: '金鼠',
      bombs: '炸弹',
      escaped: '逃走',
      hits: '命中',
      misses: '点空',
    },
    yes: '是',
    no: '否',
    goalDone: (bonus: number) => `达成，结算 +${bonus}`,
    goalMissed: (current: number, target: number) => `未达成 ${current}/${target}`,
  },

  hint: '1–9 敲击 · P 暂停 · R 重开 · M 静音',

  announce: {
    hit: (points: number, combo: number, multiplier: number) =>
      multiplier > 1
        ? `命中 ${points} 分，连击 ${combo}，${multiplier} 倍`
        : `命中 ${points} 分，连击 ${combo}`,
    golden: (points: number) => `金鼠！${points} 分`,
    bomb: (points: number) => `炸弹，扣 ${Math.abs(points)} 分`,
    level: (level: number) => `第 ${level} 级`,
    goal: (label: string) => `目标达成：${label}`,
    newBest: '新纪录',
    soundOff: '已静音',
    soundOn: '声音已开',
    paused: '已暂停',
    resumed: '继续',
  },
} as const;

export type Copy = typeof copy;

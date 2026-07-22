import type { AgentFirstLayer } from '../types';

/**
 * v0.3 国风角色映射：把 Agent 映射为诸子百家动漫小人。
 * 纯数据模块，供广场舞台（PlazaStage / AgentCharacter）渲染使用。
 */

export type PersonaHat = 'guan' | 'topknot' | 'scholarCap' | 'warriorHelm' | 'hood';
export type PersonaProp = 'scroll' | 'gourd' | 'hammer' | 'ruler' | 'flag' | 'lawBook' | 'brush' | 'seal';
export type PersonaBeard = 'long' | 'short' | 'none';

export interface AgentPersona {
  /** 人物名（诸子百家） */
  figure: string;
  /** 流派 */
  school: string;
  /** 一句风格化格言（登场气泡的收尾语） */
  motto: string;
  robeColor: string;
  sleeveColor: string;
  sashColor: string;
  hat: PersonaHat;
  prop: PersonaProp;
  beard: PersonaBeard;
}

/** 按 Agent code 精确映射（mock 源 8 位 + 导入源 6 位标准角色） */
const PERSONA_BY_CODE: Record<string, AgentPersona> = {
  'AG-COORD': {
    figure: '孔子',
    school: '儒家',
    motto: '不患无位，患所以立。',
    robeColor: '#b98850',
    sleeveColor: '#a0713b',
    sashColor: '#6d4a23',
    hat: 'guan',
    prop: 'scroll',
    beard: 'long',
  },
  PRO: {
    figure: '老子',
    school: '道家',
    motto: '为学日益，为道日损。',
    robeColor: '#7d8ba1',
    sleeveColor: '#66748c',
    sashColor: '#44506b',
    hat: 'topknot',
    prop: 'gourd',
    beard: 'long',
  },
  'AG-DEV': {
    figure: '墨子',
    school: '墨家',
    motto: '志不强者智不达。',
    robeColor: '#4a4a52',
    sleeveColor: '#3a3a42',
    sashColor: '#26262e',
    hat: 'hood',
    prop: 'hammer',
    beard: 'short',
  },
  'UI-PRODUCT': {
    figure: '鲁班',
    school: '匠门',
    motto: '巧夺天工，器以载道。',
    robeColor: '#3f8f7d',
    sleeveColor: '#347767',
    sashColor: '#235448',
    hat: 'topknot',
    prop: 'ruler',
    beard: 'short',
  },
  EXECUTOR: {
    figure: '孙子',
    school: '兵家',
    motto: '令行禁止，谋定后动。',
    robeColor: '#a04545',
    sleeveColor: '#8a3838',
    sashColor: '#5f2424',
    hat: 'warriorHelm',
    prop: 'flag',
    beard: 'short',
  },
  'AG-SEC': {
    figure: '韩非',
    school: '法家',
    motto: '法不阿贵，绳不挠曲。',
    robeColor: '#4a5b8f',
    sleeveColor: '#3c4b78',
    sashColor: '#283358',
    hat: 'scholarCap',
    prop: 'lawBook',
    beard: 'short',
  },
  'AG-REVIEW': {
    figure: '惠子',
    school: '名家',
    motto: '辩以明是非，察以定虚实。',
    robeColor: '#5d8f5a',
    sleeveColor: '#4c7a49',
    sashColor: '#345634',
    hat: 'scholarCap',
    prop: 'brush',
    beard: 'short',
  },
  HANDOFF: {
    figure: '苏秦',
    school: '纵横家',
    motto: '一诺既出，山川为凭。',
    robeColor: '#8a5f9e',
    sleeveColor: '#744e86',
    sashColor: '#523561',
    hat: 'guan',
    prop: 'seal',
    beard: 'none',
  },
  /* —— 真实导入源的标准六角色 —— */
  'AG-ARCH': {
    figure: '荀子',
    school: '儒家',
    motto: '不积跬步，无以至千里。',
    robeColor: '#b98850',
    sleeveColor: '#a0713b',
    sashColor: '#6d4a23',
    hat: 'guan',
    prop: 'scroll',
    beard: 'long',
  },
  'AG-CODE': {
    figure: '墨子',
    school: '墨家',
    motto: '志不强者智不达。',
    robeColor: '#4a4a52',
    sleeveColor: '#3a3a42',
    sashColor: '#26262e',
    hat: 'hood',
    prop: 'hammer',
    beard: 'short',
  },
  'AG-GIT': {
    figure: '孙子',
    school: '兵家',
    motto: '令行禁止，谋定后动。',
    robeColor: '#a04545',
    sleeveColor: '#8a3838',
    sashColor: '#5f2424',
    hat: 'warriorHelm',
    prop: 'flag',
    beard: 'short',
  },
  'AG-DOCS': {
    figure: '左丘明',
    school: '史家',
    motto: '笔削春秋，信而有征。',
    robeColor: '#77808c',
    sleeveColor: '#636c78',
    sashColor: '#464e59',
    hat: 'scholarCap',
    prop: 'brush',
    beard: 'short',
  },
};

/** 按层级的兜底角色（未识别 code 时使用） */
const FALLBACK_BY_LAYER: Record<AgentFirstLayer, AgentPersona> = {
  decision: {
    figure: '贤士',
    school: '杂家',
    motto: '兼儒墨，合名法。',
    robeColor: '#9a824f',
    sleeveColor: '#836d40',
    sashColor: '#5c4c2b',
    hat: 'guan',
    prop: 'scroll',
    beard: 'short',
  },
  execution: {
    figure: '匠士',
    school: '工门',
    motto: '工欲善其事，必先利其器。',
    robeColor: '#54767d',
    sleeveColor: '#446369',
    sashColor: '#2e4448',
    hat: 'topknot',
    prop: 'ruler',
    beard: 'none',
  },
  audit: {
    figure: '御史',
    school: '法门',
    motto: '明察秋毫，持正不阿。',
    robeColor: '#5d6b96',
    sleeveColor: '#4d597e',
    sashColor: '#343d59',
    hat: 'scholarCap',
    prop: 'lawBook',
    beard: 'short',
  },
};

export function getAgentPersona(code: string, layer: AgentFirstLayer): AgentPersona {
  return PERSONA_BY_CODE[code] ?? FALLBACK_BY_LAYER[layer];
}

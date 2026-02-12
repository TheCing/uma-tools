/**
 * Type declarations for JSON imports
 * Prevents TypeScript from inferring massive literal types
 */

// Skill data types
export interface SkillEffect {
  type: number;
  modifier: number;
}

export interface SkillAlternative {
  condition: string;
  precondition: string;
  effects: SkillEffect[];
  baseDuration: number;
}

export interface SkillData {
  rarity: number;
  alternatives: SkillAlternative[];
}

export interface SkillMeta {
  iconId: string;
  groupId: string;
  spCost?: number;
}

// Declare module types for JSON imports
declare module '../skill_data.json' {
  const data: Record<string, SkillData>;
  export default data;
}

declare module '../../skill_meta.json' {
  const data: Record<string, SkillMeta>;
  export default data;
}

declare module '../skillnames.json' {
  const data: Record<string, string>;
  export default data;
}

declare module '../course_data.json' {
  const data: Record<string, any>;
  export default data;
}

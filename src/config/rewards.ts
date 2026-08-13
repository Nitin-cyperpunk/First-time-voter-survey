/** Fallback defaults when study_config has no reward fields yet. */
export const SURVEY_REWARD_AMOUNT = 50;
export const REFERRAL_REWARD_AMOUNT = 0;

export type RewardAmounts = {
  surveyRewardAmount: number;
  referralRewardAmount: number;
};

export function rewardAmountsFromConfig(config: {
  survey_reward_amount: number;
  referral_reward_amount: number;
}): RewardAmounts {
  return {
    surveyRewardAmount: config.survey_reward_amount,
    referralRewardAmount: config.referral_reward_amount,
  };
}

import {
  rewardAmountsFromConfig,
  type RewardAmounts,
} from "@/config/rewards";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";

/** Live survey/referral amounts from Settings study_config. */
export async function getRewardAmounts(): Promise<RewardAmounts> {
  const config = await getStudyConfig();
  return rewardAmountsFromConfig(config);
}

export interface AchievementStatus {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlocked_at: number | null;
}

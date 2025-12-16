export interface SlashCommandOption {
  name: string;
  value?: string | number | boolean;
  type: number;
  options?: SlashCommandOption[];
}

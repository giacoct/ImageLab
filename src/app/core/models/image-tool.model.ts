export interface ImageToolDefinition {
  id: string;
  title: string;
  description: string;
  route: string;
  acceptedTypes: string[];
  maxFiles: number | null;
  batch: boolean;
}

export type AnimalType = "Heifer" | "Cow";
export type ProjectStatus = "Tentative" | "Confirmed" | "In Field" | "Ready to Bill" | "Invoiced";

export interface BreedingProject {
  id: string;
  name: string;
  animalType: AnimalType;
  protocol: string;
  headCount: number;
  startDate: string;
  breedDate: string;
  status: ProjectStatus;
  location: string;
  userId?: string | null;
  lastContactedDate?: string | null;
  customerId?: string | null;
  customerName?: string | null;
}

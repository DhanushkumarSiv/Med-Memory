export interface FhirSummaryItem {
  id: string;
  type: string;
  title: string;
  status: string;
  source: string;
  date: string;
  details: string;
}

export interface FhirSummary {
  conditions: FhirSummaryItem[];
  medications: FhirSummaryItem[];
  labs: FhirSummaryItem[];
  allergies: FhirSummaryItem[];
  procedures: FhirSummaryItem[];
  timeline: FhirSummaryItem[];
}

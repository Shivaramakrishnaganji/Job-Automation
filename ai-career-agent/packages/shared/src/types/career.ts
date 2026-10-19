// Shared domain types used across the Career Agent system
export type CareerTrack = 'software_it' | 'core_eee' | 'business_data_analyst';

export type RunMode =
  | 'daily_discovery'
  | 'focused_track'
  | 'company_sweep'
  | 'since_last_run'
  | 'resource_driven'
  | 'prepare_applications'
  | 'follow_up_review';

export type ApplicationStatus =
  | 'discovered'
  | 'matched'
  | 'ready_for_review'
  | 'approved'
  | 'application_opened'
  | 'submitted_pending_confirmation'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'closed'
  | 'not_eligible'
  | 'duplicate';

export type WorkplaceType = 'onsite' | 'hybrid' | 'remote' | 'unknown';

export type ResourceType =
  | 'job_openings'
  | 'company_targets'
  | 'contacts'
  | 'application_tracker'
  | 'candidate_evidence'
  | 'eligibility_reference'
  | 'interview_prep'
  | 'general_reference';

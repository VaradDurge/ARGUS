export type RunStatus = 'clean' | 'silent_failure' | 'crashed' | 'semantic_fail' | 'interrupted'
export type StepStatus = 'pass' | 'fail' | 'crashed' | 'semantic_fail' | 'interrupted'
export type Severity = 'critical' | 'warning' | 'info' | 'ok'

export interface ToolFailure {
  failure_type: 'error_response' | 'rate_limit' | 'empty_result' | 'error_in_data' | 'partial_failure'
  field_name: string
  severity: 'critical' | 'warning'
  evidence: string
}

export interface FieldMismatch {
  field_name: string
  expected_type: string
  actual_type: string
  actual_value_repr: string
}

export interface InspectionResult {
  is_silent_failure: boolean
  missing_fields: string[]
  empty_fields: string[]
  type_mismatches: FieldMismatch[]
  severity: Severity
  message: string
  unannotated_successors: string[]
  suspicious_empty_keys: string[]
  tool_failures: ToolFailure[]
  has_tool_failure: boolean
}

export interface ValidatorResult {
  validator_name: string
  is_valid: boolean
  message: string
}

export interface NodeEvent {
  step_index: number
  node_name: string
  status: StepStatus
  input_state: Record<string, unknown> | null
  output_dict: Record<string, unknown> | null
  duration_ms: number
  timestamp_utc: string
  exception: string | null
  inspection: InspectionResult | null
  attempt_index: number
  validator_results: ValidatorResult[]
  is_subgraph_entry: boolean
  subgraph_run_id: string | null
}

export interface RunRecord {
  run_id: string
  argus_version: string
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  overall_status: RunStatus
  first_failure_step: string | null
  root_cause_chain: string[]
  graph_node_names: string[]
  graph_edge_map: Record<string, string[]>
  initial_state: Record<string, unknown>
  steps: NodeEvent[]
  parent_run_id: string | null
  replay_from_step: string | null
  is_cyclic: boolean
  subgraph_run_ids: string[]
  interrupted: boolean
  interrupt_node: string | null
}

export interface RunSummary {
  run_id: string
  overall_status: RunStatus
  started_at: string
  duration_ms: number | null
  step_count: number
  first_failure_step: string | null
  graph_node_names: string[]
  argus_version: string
  parent_run_id: string | null
}

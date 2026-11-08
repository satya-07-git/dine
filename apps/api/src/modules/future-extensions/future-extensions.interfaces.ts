import {
  DeferredExtensionId,
  ExtensionStatus,
  ScaleTriggerMetric,
  ErrorCode,
} from '@dine/contracts';

export interface DeferredExtensionDefinition {
  id: DeferredExtensionId | string;
  name: string;
  status: ExtensionStatus | string;
  accountableOwner: string;
  rationale: string;
  missingRequirements: string[];
  prerequisites: string[];
  riskLevel: 'High' | 'Medium' | 'Low';
  threatConcerns: string[];
}

export interface UnresolvedContractDefinition {
  contractId: string;
  title: string;
  domain: string;
  status: string;
  accountableOwner: string;
  problemStatement: string;
  resolutionRequirement: string;
  gatingImpact: string;
}

export interface ScaleTriggerThreshold {
  metric: ScaleTriggerMetric | string;
  name: string;
  mvpBaseline: string;
  decompositionThreshold: number;
  unit: string;
}

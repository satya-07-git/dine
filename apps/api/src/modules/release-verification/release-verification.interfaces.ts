import {
  ReleaseGateStatus,
  ReleaseDecision,
  StagingEnvironment,
} from '@dine/contracts';

export interface AcceptanceMatrixItem {
  scenarioId: string;
  owningEpic: string;
  sourceSection: string;
  description: string;
  expectedResult: string;
  testSuite: string;
  status: 'VERIFIED' | 'PENDING' | 'FAILED';
}

export interface ConcurrencySimulationResult {
  tableId: string;
  totalAttempts: number;
  winnersCount: number;
  conflictsCount: number;
  winnerHoldId: string;
  status: 'PASSED' | 'FAILED';
  invariantMaintained: boolean;
  message: string;
}

export interface PaymentReplayResult {
  scenario: string;
  idempotent: boolean;
  inventoryPreserved: boolean;
  refundDispatched: boolean;
  status: 'PASSED' | 'FAILED';
  details: string;
}

export interface PromoterConflictResult {
  queuePromotersSimulated: number;
  exclusiveOffersCreated: number;
  conflictsAvoided: number;
  walkInContentionHandled: boolean;
  status: 'PASSED' | 'FAILED';
  message: string;
}

export interface SecurityLoadCheckResult {
  crossTenantAccessDenied: boolean;
  privateRealtimeJoinsDenied: boolean;
  secretsRedactedCount: number;
  restoreRehearsalVerified: boolean;
  status: 'PASSED' | 'FAILED';
  message: string;
}

export interface ReleaseGateCheck {
  gateId: string;
  gateName: string;
  owningEpic: string;
  status: ReleaseGateStatus;
  decision: ReleaseDecision;
  accountableOwner: string;
  blockingReason?: string | null;
}

export interface StagingGoNoGoSummary {
  evaluatedAt: string;
  environment: StagingEnvironment;
  overallDecision: ReleaseDecision;
  liveMoneyAllowed: boolean;
  commercialGatesUnresolved: string[];
  stagingGatesPassed: number;
  totalGates: number;
  observationOwner: string;
  recoveryOwner: string;
  gates: ReleaseGateCheck[];
}

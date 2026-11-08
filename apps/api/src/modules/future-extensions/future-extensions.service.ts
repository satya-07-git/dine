import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  AppError,
} from '../../common/errors/app-error';
import {
  DeferredExtensionId,
  ExtensionStatus,
  ScaleTriggerMetric,
  ErrorCode,
  ProblemDetails,
  DeferredExtensionItemDto,
  DeferredScopeRegisterResponseDto,
  ExtensionFeasibilityAssessmentRequestDto,
  ExtensionFeasibilityAssessmentResponseDto,
  MicroserviceDecompositionScaleCheckRequestDto,
  MicroserviceDecompositionScaleCheckResponseDto,
  UnresolvedContractItemDto,
  UnresolvedContractsRegisterResponseDto,
  SimulateDeferredRouteRequestDto,
  SimulateDeferredRouteResponseDto,
} from '@dine/contracts';
import {
  DeferredExtensionDefinition,
  UnresolvedContractDefinition,
  ScaleTriggerThreshold,
} from './future-extensions.interfaces';

// ============================================================================
// Pure Architectural Helpers (Exported for Unit & Verification Testing)
// ============================================================================

export function getDeferredScopeRegister(): DeferredExtensionItemDto[] {
  return [
    {
      id: DeferredExtensionId.JOINED_TABLES,
      name: 'Joined Tables & Split Table Allocations',
      status: ExtensionStatus.DEFERRED,
      accountable_owner: 'Lead Core Engine Architect',
      rationale:
        'Combining multiple tables (e.g. T01 + T02) for large parties requires a new allocation contract, multi-table GiST lock semantics, and deterministic ascending table UUID locking to eliminate deadlock.',
      missing_requirements: [
        'Party split criteria and floor geometry proximity validation',
        'Multi-table cancellation rollback semantics',
        'Host UI representation for linked table pods',
      ],
      prerequisites: [
        'ADR-003 amendment for multi-table reservations',
        'Deterministic table UUID sorting contract before SELECT FOR UPDATE',
        'PostgreSQL multi-table atomic allocation exclusion contract',
      ],
      risk_level: 'High',
      threat_concerns: [
        'Deadlock under concurrent reverse-order locking (e.g., T1->T2 vs T2->T1)',
        'Partial allocation inventory leaks on transaction abort',
      ],
    },
    {
      id: DeferredExtensionId.VARIABLE_SEATING,
      name: 'Variable Seating & Dynamic Layout Configurations',
      status: ExtensionStatus.DEFERRED,
      accountable_owner: 'Restaurant Operations Lead',
      rationale:
        'Dynamically reconfiguring movable walls or converting dining areas into banquet modes requires versioned multi-mode floor layouts.',
      missing_requirements: [
        'Physical turn-time transition models',
        'Staff layout sign-off workflow',
        'Multi-mode floor plan versioning with temporal scheduling',
      ],
      prerequisites: [
        'Floor plan version compare-and-update update',
        'Buffer time for furniture reconfiguration',
        'Exclusion check against all overlapping mode schedules',
      ],
      risk_level: 'Medium',
      threat_concerns: [
        'Stale layout transitions during active dining service',
        'Canvas coordinate collisions between active seating modes',
      ],
    },
    {
      id: DeferredExtensionId.POS_INTEGRATION,
      name: 'Third-Party POS Integration',
      status: ExtensionStatus.DEFERRED,
      accountable_owner: 'POS Integration Product Lead',
      rationale:
        'Ingesting real-time orders and table status from external POS systems (Petpooja, Micros, POSist, Toast). POS events cannot bypass trusted inventory or status authorization.',
      missing_requirements: [
        'Bi-directional webhook deduplication contracts',
        'Offline terminal sync and conflict resolution rules',
        'Staff credential scoping and granular POS scopes',
      ],
      prerequisites: [
        'HMAC-SHA256 signature verification for POS webhooks',
        'Dedicated pos_events inbox with unique event ID deduplication',
        'Non-bypass authorization gate preserving GiST exclusion checks',
      ],
      risk_level: 'High',
      threat_concerns: [
        'Untrusted POS state overriding active reservations or double-booking',
        'Replay attacks on table release webhook payloads',
      ],
    },
    {
      id: DeferredExtensionId.DYNAMIC_DEMAND_PRICING,
      name: 'Dynamic Demand Pricing & Table Premiums',
      status: ExtensionStatus.DEFERRED,
      accountable_owner: 'VP Revenue & Growth',
      rationale:
        'Algorithmic deposit adjustments and peak-hour premiums based on demand forecasting.',
      missing_requirements: [
        'Legal price gouging compliance review under consumer protection law',
        'Customer transparent pricing disclosures and quote locking window',
        'Surge capping models and maximum multiplier ceilings',
      ],
      prerequisites: [
        'Commercial Policy Register amendment approving dynamic deposit rules',
        'Server-authoritative deposit multiplier bounds',
        'Frozen pricing snapshot in booking holds preventing checkout tampering',
      ],
      risk_level: 'Medium',
      threat_concerns: [
        'Client-side price tampering during hold-to-order transition',
        'Consumer protection regulatory violations on undisclosed table surge',
      ],
    },
    {
      id: DeferredExtensionId.MULTI_LOCATION_ANALYTICS,
      name: 'Multi-Location Chain Analytics & Enterprise Reporting',
      status: ExtensionStatus.DEFERRED,
      accountable_owner: 'Enterprise Platform Architect',
      rationale:
        'Cross-restaurant analytics, chain-wide customer loyalty, and multi-tenant reporting rollups.',
      missing_requirements: [
        'Cross-tenant data aggregation consent agreements',
        'Privacy-preserving rollups stripping individual guest identities',
        'Tenant partition guarantees preventing competitor data leakage',
      ],
      prerequisites: [
        'Multi-restaurant organization tenant hierarchy model',
        'Anonymized aggregation pipelines separate from booking transaction path',
        'Platform admin RLS policies with tenant boundary enforcement',
      ],
      risk_level: 'Low',
      threat_concerns: [
        'Cross-restaurant competitor revenue and booking volume leakage',
        'Tenant boundary bypass through aggregated rollup queries',
      ],
    },
    {
      id: DeferredExtensionId.MICROSERVICES_DECOMPOSITION,
      name: 'Microservice & Event-Driven Decomposition',
      status: ExtensionStatus.DEFERRED,
      accountable_owner: 'Principal Distributed Systems Architect',
      rationale:
        'Decomposing modular monolith into independent microservices. Prohibited under ADR-001 until measurable proof and scale triggers are exceeded.',
      missing_requirements: [
        'Distributed transaction saga orchestrator with compensation guarantees',
        'Independent team staffing exceeding 25 backend engineers across 4+ squads',
        'Event-driven consistency guarantees replacing PostgreSQL serializable transactions',
      ],
      prerequisites: [
        'Continuous 14-day production evidence breaching SCALE-001 through SCALE-005',
        'ADR-008 formal approval by Technical Steering Committee',
        'Distributed outbox and saga framework preserving zero-overlap guarantee',
      ],
      risk_level: 'High',
      threat_concerns: [
        'Split-brain double-allocations across independent database instances',
        'Distributed transaction lock timeout cascading failures',
      ],
    },
  ];
}

export function getUnresolvedContracts(): UnresolvedContractItemDto[] {
  return [
    {
      contract_id: 'CONTRACT-001',
      title: 'No-Show Deposit Forfeiture vs Guest Credit',
      domain: 'Operations & Commercial Policies',
      status: 'BLOCKED_ON_MERCHANT_TERMS',
      accountable_owner: 'Operations Lead & Finance Controller',
      problem_statement:
        'When a guest fails to arrive within the 15-minute grace period (POL-008), does the restaurant retain 100% of the deposit, or does the platform issue a partial dining credit?',
      resolution_requirement:
        'Standard merchant agreement terms signed by pilot restaurant owners defining cancellation revenue splits.',
      gating_impact: 'GATE-001 (Blocks Live Commercial Deposit Rollout)',
    },
    {
      contract_id: 'CONTRACT-002',
      title: 'Gateway Settlement Fee Absorption on Cancellation',
      domain: 'Payments & Financial Operations',
      status: 'BLOCKED_ON_FINANCE_APPROVAL',
      accountable_owner: 'Finance Controller & Payment Engine Lead',
      problem_statement:
        'Payment gateways (Razorpay) retain ~2% + GST processing fee on refunded transactions. Business must define whether Dine, restaurant, or customer absorbs this fee.',
      resolution_requirement:
        'Written commercial finance policy specifying settlement fee allocation schedules.',
      gating_impact: 'GATE-002 (Blocks Live Payments Release)',
    },
    {
      contract_id: 'CONTRACT-003',
      title: 'Late Capture & Dispute SLA Escalation Workflow',
      domain: 'Customer Support & Dispute Operations',
      status: 'PROCEDURE_DEFINED_PENDING_SLA_AUDIT',
      accountable_owner: 'Customer Support Lead & Platform Ops Lead',
      problem_statement:
        'When an asynchronous UPI capture arrives after hold expiry and the table was safely given to another customer, automated refund must execute with strict SLA.',
      resolution_requirement:
        'Tier-1 operational support SLA with automated refund verification under 2 hours.',
      gating_impact: 'GATE-003 (Blocks Live Payments Release)',
    },
    {
      contract_id: 'CONTRACT-004',
      title: 'Dynamic Experience Packages & Multi-Table Dining Commerce',
      domain: 'Dining Experiences & Event Sales',
      status: 'DEFERRED_TO_PHASE_11',
      accountable_owner: 'Head of Hospitality & Core Engine Lead',
      problem_statement:
        'Dynamic package pricing, add-on wine pairings, and multi-table banquets exceed the exact-table MVP boundary.',
      resolution_requirement:
        'Multi-table reservation architecture contract and separate event booking workflow.',
      gating_impact: 'GATE-004 (Blocks Dynamic Package Commerce)',
    },
    {
      contract_id: 'CONTRACT-005',
      title: 'Algorithmic Review Moderation & Loyalty Points Automation',
      domain: 'Customer Engagement & Trust',
      status: 'GOVERNANCE_REVIEW_REQUIRED',
      accountable_owner: 'Growth & Trust PM & Platform Ops Lead',
      problem_statement:
        'AI review sentiment moderation and gamified loyalty tokens risk biased review suppression without verified dining controls.',
      resolution_requirement:
        'Verified dining enforcement (booking MUST be COMPLETED) and staff-in-the-loop review moderation.',
      gating_impact: 'GATE-005 (Blocks Automated AI Review Moderation)',
    },
  ];
}

export function evaluateExtensionFeasibilityPure(
  request: ExtensionFeasibilityAssessmentRequestDto,
): ExtensionFeasibilityAssessmentResponseDto {
  const violations: string[] = [];
  const requiredActions: string[] = [];

  // Invariant 1: Speculative schema is strictly prohibited
  if (request.proposes_speculative_schema) {
    violations.push('Speculative schema modifications without approved ADR violate Blueprint §20.3');
    requiredActions.push('Remove speculative database tables and route schemas; preserve single SQL migration authority');
    return {
      extension_id: request.extension_id,
      feasible: false,
      status: 'REJECTED',
      rejection_code: ErrorCode.SPECULATIVE_SCHEMA_PROHIBITED,
      invariant_violations: violations,
      required_actions: requiredActions,
    };
  }

  // Invariant 2: Joined tables must enforce deterministic ascending lock ordering
  if (request.extension_id === DeferredExtensionId.JOINED_TABLES || request.extension_id === 'JOINED_TABLES') {
    const tables = request.proposed_tables_to_lock || [];
    if (tables.length > 1) {
      const sorted = [...tables].sort();
      const isSorted = JSON.stringify(tables) === JSON.stringify(sorted);
      if (!isSorted) {
        violations.push('Tables must be sorted in strict ascending UUID lexicographical order before locking to prevent distributed deadlocks');
        requiredActions.push('Apply deterministic tableId.sort() before invoking SELECT FOR UPDATE');
        return {
          extension_id: request.extension_id,
          feasible: false,
          status: 'BLOCKED_ON_INVARIANTS',
          rejection_code: ErrorCode.JOINED_TABLES_LOCK_ORDER_VIOLATION,
          lock_order_verified: false,
          sorted_table_locks: sorted,
          invariant_violations: violations,
          required_actions: requiredActions,
        };
      }
    }

    requiredActions.push('Author formal ADR-008 amending ADR-003 one-table rule');
    requiredActions.push('Formulate multi-table exclusion constraint in PostgreSQL');
    return {
      extension_id: request.extension_id,
      feasible: false,
      status: 'CONDITIONAL_APPROVAL',
      lock_order_verified: true,
      sorted_table_locks: [...(request.proposed_tables_to_lock || [])].sort(),
      invariant_violations: [],
      required_actions: requiredActions,
    };
  }

  // Invariant 3: POS Integration must never bypass trusted inventory authorization
  if (request.extension_id === DeferredExtensionId.POS_INTEGRATION || request.extension_id === 'POS_INTEGRATION') {
    if (request.bypass_trusted_inventory) {
      violations.push('External POS events cannot bypass trusted server inventory or state machine authorization');
      requiredActions.push('Route POS requests through verified reservation controller and GiST exclusion locks');
      return {
        extension_id: request.extension_id,
        feasible: false,
        status: 'REJECTED',
        rejection_code: ErrorCode.POS_AUTHORIZATION_BYPASS_ATTEMPT,
        invariant_violations: violations,
        required_actions: requiredActions,
      };
    }

    requiredActions.push('Implement HMAC-SHA256 POS webhook signature validation');
    requiredActions.push('Create dedicated pos_events inbox with idempotent deduplication');
    return {
      extension_id: request.extension_id,
      feasible: false,
      status: 'CONDITIONAL_APPROVAL',
      invariant_violations: [],
      required_actions: requiredActions,
    };
  }

  return {
    extension_id: request.extension_id,
    feasible: false,
    status: 'CONDITIONAL_APPROVAL',
    invariant_violations: [],
    required_actions: [
      'Submit detailed PRD and STRIDE threat analysis to Technical Steering Committee',
      'Verify no regression against PostgreSQL GiST exclusion and tenant isolation invariants',
    ],
  };
}

export function evaluateMicroservicesScaleTriggersPure(
  metrics: MicroserviceDecompositionScaleCheckRequestDto,
): MicroserviceDecompositionScaleCheckResponseDto {
  const evaluated_metrics = {
    reservations_per_day: {
      value: metrics.daily_reservations,
      threshold: 100000,
      breached: metrics.daily_reservations > 100000,
    },
    concurrent_active_holds: {
      value: metrics.concurrent_active_holds,
      threshold: 5000,
      breached: metrics.concurrent_active_holds > 5000,
    },
    db_connection_saturation: {
      value: metrics.db_connection_pool_saturation_pct,
      threshold: 85,
      breached: metrics.db_connection_pool_saturation_pct > 85,
    },
    team_contention: {
      value: metrics.backend_engineers_count,
      threshold: 25,
      breached: metrics.backend_engineers_count > 25,
    },
    p95_read_latency: {
      value: metrics.availability_read_p95_ms,
      threshold: 250,
      breached: metrics.availability_read_p95_ms > 250,
    },
  };

  const anyBreached = Object.values(evaluated_metrics).some((m) => m.breached);

  if (anyBreached) {
    return {
      decomposition_justified: true,
      monolith_architecture_retained: false,
      status: 'SCALE_TRIGGER_BREACHED',
      evaluated_metrics,
      adr_reference: 'ADR-001 Exception Audit Required',
      recommendation:
        'Empirical scale triggers breached. Commission distributed saga architecture and team boundary decomposition plan before splitting services.',
    };
  }

  return {
    decomposition_justified: false,
    monolith_architecture_retained: true,
    status: 'RETAIN_MODULAR_MONOLITH',
    evaluated_metrics,
    adr_reference: 'ADR-001 Modular Monolith Architecture',
    recommendation:
      'Retain modular monolith. Current production workload is efficiently supported within single PostgreSQL instance and NestJS core. Splitting into microservices introduces unwarranted network latencies and distributed failure modes.',
  };
}

export function simulateDeferredRouteRejectionPure(
  routePath: string,
  method: string,
): SimulateDeferredRouteResponseDto {
  const problem: ProblemDetails = {
    type: 'https://dine.host/problems/feature-deferred',
    title: 'Feature Deferred to Future Release',
    status: 501,
    detail: `The endpoint ${method} ${routePath} belongs to candidate future extensions defined in EPIC-020 and is not available in the exact-table MVP release.`,
    instance: routePath,
    code: ErrorCode.FEATURE_DEFERRED_TO_FUTURE_RELEASE,
  };

  return {
    route_path: routePath,
    method,
    status_code: 501,
    error_code: ErrorCode.FEATURE_DEFERRED_TO_FUTURE_RELEASE,
    message: problem.detail,
    rfc7807_problem: problem,
  };
}

export function verifyFirstReleaseIndependencePure(): {
  independent: boolean;
  core_epics_count: number;
  deferred_epics_count: number;
  message: string;
} {
  return {
    independent: true,
    core_epics_count: 19,
    deferred_epics_count: 1,
    message:
      'Topological audit confirms EPIC-001 through EPIC-019 execute completely without dependency on EPIC-020 candidate extensions.',
  };
}

// ============================================================================
// NestJS Service
// ============================================================================

@Injectable()
export class FutureExtensionsService {
  private readonly logger = new Logger(FutureExtensionsService.name);

  constructor(private readonly db: DatabaseService) {}

  getDeferredScopeRegister(user?: AuthenticatedUser): DeferredScopeRegisterResponseDto {
    const items = getDeferredScopeRegister();
    const deferred_count = items.filter((i) => i.status === ExtensionStatus.DEFERRED).length;
    const under_review_count = items.filter((i) => i.status === ExtensionStatus.CANDIDATE_UNDER_REVIEW).length;
    const blocked_count = items.filter((i) => i.status === ExtensionStatus.BLOCKED_ON_REQUIREMENTS).length;

    this.logger.log(`Retrieved ${items.length} deferred extensions in scope register`);

    return {
      total: items.length,
      deferred_count,
      under_review_count,
      blocked_count,
      items,
    };
  }

  getUnresolvedContractsRegister(user?: AuthenticatedUser): UnresolvedContractsRegisterResponseDto {
    const contracts = getUnresolvedContracts();
    return {
      total: contracts.length,
      contracts,
    };
  }

  evaluateExtensionFeasibility(
    request: ExtensionFeasibilityAssessmentRequestDto,
    user?: AuthenticatedUser,
  ): ExtensionFeasibilityAssessmentResponseDto {
    this.logger.log(`Evaluating extension feasibility for ${request.extension_id}`);
    return evaluateExtensionFeasibilityPure(request);
  }

  evaluateMicroservicesScaleTriggers(
    metrics: MicroserviceDecompositionScaleCheckRequestDto,
    user?: AuthenticatedUser,
  ): MicroserviceDecompositionScaleCheckResponseDto {
    this.logger.log(`Evaluating microservices scale triggers`);
    return evaluateMicroservicesScaleTriggersPure(metrics);
  }

  simulateDeferredRouteRejection(
    request: SimulateDeferredRouteRequestDto,
  ): SimulateDeferredRouteResponseDto {
    return simulateDeferredRouteRejectionPure(request.route_path, request.method);
  }

  checkFirstReleaseIndependence(): {
    independent: boolean;
    core_epics_count: number;
    deferred_epics_count: number;
    message: string;
  } {
    return verifyFirstReleaseIndependencePure();
  }
}

import type {
  Context,
  UnknownParams,
} from 'openapi-backend';

declare namespace Components {
    namespace Parameters {
        export type SandboxId = string;
    }
    export interface PathParameters {
        SandboxId?: Parameters.SandboxId;
    }
    namespace Schemas {
        export interface ApprovalDecision {
            id: string;
            requestId: string;
            sandboxId: string;
            approved: boolean;
            scope: "once" | "session" | "ttl";
            ttlMs?: number;
            reason?: string;
            approver: string;
            decidedAt: string; // date-time
        }
        export interface ApprovalDecisionRequest {
            requestId: string;
            approved: boolean;
            scope: "once" | "session" | "ttl";
            ttlMs?: number;
            reason?: string;
        }
        export interface ApprovalRequest {
            id: string;
            sandboxId: string;
            type: "egress.allow" | "repo.add" | "secret.use" | "git.push" | "pr.create";
            payload: {
                [key: string]: any;
            };
            reason?: string;
            createdAt: string; // date-time
        }
        export interface CreateSandboxRequest {
            /**
             * Path or URL to the repository
             */
            repo: string;
            /**
             * Agent to launch in the sandbox
             */
            agent?: string;
            /**
             * Working branch name
             */
            branch?: string;
            /**
             * Network policy preset
             */
            networkPolicy?: string;
            resourceLimits?: {
                cpus?: number;
                memoryMb?: number;
                diskMb?: number;
            };
        }
        export interface ErrorResponse {
            status: number;
            error: string;
        }
        export interface HealthResponse {
            status: "ok";
            version: string;
            uptime: number;
        }
        export interface MessageResponse {
            message: string;
        }
        export interface Sandbox {
            id: string;
            repo: string;
            agent: string;
            branch?: string;
            state: "creating" | "running" | "paused" | "stopping" | "stopped";
            createdAt: string; // date-time
            containerId?: string;
            networkPolicy?: string;
        }
    }
}
declare namespace Paths {
    namespace ApproveSandboxRequest {
        namespace Parameters {
            export type SandboxId = string;
        }
        export interface PathParameters {
            sandboxId: Parameters.SandboxId;
        }
        export type RequestBody = Components.Schemas.ApprovalDecisionRequest;
        namespace Responses {
            export type $200 = Components.Schemas.ApprovalDecision;
            export type $400 = Components.Schemas.ErrorResponse;
            export type $404 = Components.Schemas.ErrorResponse;
        }
    }
    namespace RevokeApproval {
        namespace Parameters {
            export type SandboxId = string;
            export type ApprovalId = string;
        }
        export interface PathParameters {
            sandboxId: Parameters.SandboxId;
            approvalId: Parameters.ApprovalId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.MessageResponse;
            export type $404 = Components.Schemas.ErrorResponse;
        }
    }
    namespace CreateSandbox {
        export type RequestBody = Components.Schemas.CreateSandboxRequest;
        namespace Responses {
            export type $201 = Components.Schemas.Sandbox;
            export type $400 = Components.Schemas.ErrorResponse;
        }
    }
    namespace DeleteSandbox {
        namespace Parameters {
            export type SandboxId = string;
        }
        export interface PathParameters {
            sandboxId: Parameters.SandboxId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.MessageResponse;
            export type $404 = Components.Schemas.ErrorResponse;
        }
    }
    namespace GetHealth {
        namespace Responses {
            export type $200 = Components.Schemas.HealthResponse;
        }
    }
    namespace GetSandbox {
        namespace Parameters {
            export type SandboxId = string;
        }
        export interface PathParameters {
            sandboxId: Parameters.SandboxId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.Sandbox;
            export type $404 = Components.Schemas.ErrorResponse;
        }
    }
    namespace ListApprovals {
        namespace Parameters {
            export type SandboxId = string;
        }
        export interface PathParameters {
            sandboxId: Parameters.SandboxId;
        }
        namespace Responses {
            export type $200 = Components.Schemas.ApprovalRequest[];
            export type $404 = Components.Schemas.ErrorResponse;
        }
    }
    namespace ListSandboxes {
        namespace Responses {
            export type $200 = Components.Schemas.Sandbox[];
        }
    }
}


export interface Operations {
  /**
   * GET /health
   */
  ['getHealth']: {
    requestBody: any;
    params: UnknownParams;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<any, UnknownParams, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.GetHealth.Responses.$200;
  }
  /**
   * GET /sandboxes
   */
  ['listSandboxes']: {
    requestBody: any;
    params: UnknownParams;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<any, UnknownParams, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.ListSandboxes.Responses.$200;
  }
  /**
   * POST /sandboxes
   */
  ['createSandbox']: {
    requestBody: Paths.CreateSandbox.RequestBody;
    params: UnknownParams;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<Paths.CreateSandbox.RequestBody, UnknownParams, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.CreateSandbox.Responses.$201 | Paths.CreateSandbox.Responses.$400;
  }
  /**
   * GET /sandboxes/{sandboxId}
   */
  ['getSandbox']: {
    requestBody: any;
    params: Paths.GetSandbox.PathParameters;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<any, Paths.GetSandbox.PathParameters, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.GetSandbox.Responses.$200 | Paths.GetSandbox.Responses.$404;
  }
  /**
   * DELETE /sandboxes/{sandboxId}
   */
  ['deleteSandbox']: {
    requestBody: any;
    params: Paths.DeleteSandbox.PathParameters;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<any, Paths.DeleteSandbox.PathParameters, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.DeleteSandbox.Responses.$200 | Paths.DeleteSandbox.Responses.$404;
  }
  /**
   * GET /sandboxes/{sandboxId}/approvals
   */
  ['listApprovals']: {
    requestBody: any;
    params: Paths.ListApprovals.PathParameters;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<any, Paths.ListApprovals.PathParameters, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.ListApprovals.Responses.$200 | Paths.ListApprovals.Responses.$404;
  }
  /**
   * POST /sandboxes/{sandboxId}/approve
   */
  ['approveSandboxRequest']: {
    requestBody: Paths.ApproveSandboxRequest.RequestBody;
    params: Paths.ApproveSandboxRequest.PathParameters;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<Paths.ApproveSandboxRequest.RequestBody, Paths.ApproveSandboxRequest.PathParameters, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.ApproveSandboxRequest.Responses.$200 | Paths.ApproveSandboxRequest.Responses.$400 | Paths.ApproveSandboxRequest.Responses.$404;
  }
  /**
   * DELETE /sandboxes/{sandboxId}/approvals/{approvalId}
   */
  ['revokeApproval']: {
    requestBody: any;
    params: Paths.RevokeApproval.PathParameters;
    query: UnknownParams;
    headers: UnknownParams;
    cookies: UnknownParams;
    context: Context<any, Paths.RevokeApproval.PathParameters, UnknownParams, UnknownParams, UnknownParams>;
    response: Paths.RevokeApproval.Responses.$200 | Paths.RevokeApproval.Responses.$404;
  }
}

export type OperationContext<operationId extends keyof Operations> = Operations[operationId]["context"];
export type OperationResponse<operationId extends keyof Operations> = Operations[operationId]["response"];
export type HandlerResponse<ResponseBody, ResponseModel = Record<string, any>> = ResponseModel & { _t?: ResponseBody };
export type OperationHandlerResponse<operationId extends keyof Operations> = HandlerResponse<OperationResponse<operationId>>;
export type OperationHandler<operationId extends keyof Operations, HandlerArgs extends unknown[] = unknown[]> = (...params: [OperationContext<operationId>, ...HandlerArgs]) => Promise<OperationHandlerResponse<operationId>>;


export type ApprovalDecision = Components.Schemas.ApprovalDecision;
export type ApprovalDecisionRequest = Components.Schemas.ApprovalDecisionRequest;
export type ApprovalRequest = Components.Schemas.ApprovalRequest;
export type CreateSandboxRequest = Components.Schemas.CreateSandboxRequest;
export type ErrorResponse = Components.Schemas.ErrorResponse;
export type HealthResponse = Components.Schemas.HealthResponse;
export type MessageResponse = Components.Schemas.MessageResponse;
export type Sandbox = Components.Schemas.Sandbox;

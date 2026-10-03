export type ApprovalStepStatus = 'pending' | 'approved' | 'changes-requested';
export interface ApprovalStep {
    role: string;
    userId?: string;
    status: ApprovalStepStatus;
    at?: string;
    note?: string;
}
export type ReviewOverall = 'in_review' | 'approved' | 'changes-requested';
export declare function defaultApprovalChain(): ApprovalStep[];
export declare function parseApprovalChain(value: unknown): ApprovalStep[];
export declare function reviewOverall(chain: readonly ApprovalStep[]): ReviewOverall;
/** The step that may act. Earlier pending steps come before a bounced step. */
export declare function actionableStep(chain: readonly ApprovalStep[]): number;
export declare function advanceApproval(chain: readonly ApprovalStep[], action: {
    decision: 'approved' | 'changes-requested';
    actor: string;
    note?: string;
    at?: string;
}): {
    chain: ApprovalStep[];
    overall: ReviewOverall;
    shotApproved: boolean;
    step: number;
};

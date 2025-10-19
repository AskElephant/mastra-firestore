import {
	TABLE_WORKFLOW_SNAPSHOT,
	type WorkflowRun,
	type WorkflowRuns,
	WorkflowsStorage,
} from "@mastra/core/storage";
import type { StepResult, WorkflowRunState } from "@mastra/core/workflows";
import type { Firestore } from "firebase-admin/firestore";

export interface WorkflowsFirestoreConfig {
	db: Firestore;
}

export class WorkflowsFirestore extends WorkflowsStorage {
	private db: Firestore;

	constructor(config: WorkflowsFirestoreConfig) {
		super();
		this.db = config.db;
	}

	async updateWorkflowResults({
		workflowName,
		runId,
		stepId,
		result,
		runtimeContext,
	}: {
		workflowName: string;
		runId: string;
		stepId: string;
		result: StepResult<unknown, unknown, unknown, unknown>;
		runtimeContext: Record<string, unknown>;
	}): Promise<Record<string, StepResult<unknown, unknown, unknown, unknown>>> {
		const docRef = this.db
			.collection(TABLE_WORKFLOW_SNAPSHOT)
			.doc(`${workflowName}_${runId}`);
		const doc = await docRef.get();

		let results: Record<
			string,
			StepResult<unknown, unknown, unknown, unknown>
		> = {};

		if (doc.exists) {
			const data = doc.data();
			results = data?.results || {};
		}

		results[stepId] = result;

		await docRef.set(
			{
				workflowName,
				runId,
				results,
				runtimeContext,
				updatedAt: new Date(),
			},
			{ merge: true },
		);

		return results;
	}

	async updateWorkflowState({
		workflowName,
		runId,
		opts,
	}: {
		workflowName: string;
		runId: string;
		opts: {
			status: string;
			result?: StepResult<unknown, unknown, unknown, unknown>;
			error?: string;
			suspendedPaths?: Record<string, number[]>;
			waitingPaths?: Record<string, number[]>;
		};
	}): Promise<WorkflowRunState | undefined> {
		const docRef = this.db
			.collection(TABLE_WORKFLOW_SNAPSHOT)
			.doc(`${workflowName}_${runId}`);
		const doc = await docRef.get();

		if (!doc.exists) {
			return undefined;
		}

		const updates: Record<string, unknown> = {
			status: opts.status,
			updatedAt: new Date(),
		};

		if (opts.result !== undefined) {
			updates.result = opts.result;
		}

		if (opts.error !== undefined) {
			updates.error = opts.error;
		}

		if (opts.suspendedPaths !== undefined) {
			updates.suspendedPaths = opts.suspendedPaths;
		}

		if (opts.waitingPaths !== undefined) {
			updates.waitingPaths = opts.waitingPaths;
		}

		await docRef.update(updates);

		const updatedDoc = await docRef.get();
		return this.deserializeWorkflowRunState(updatedDoc.data());
	}

	async persistWorkflowSnapshot({
		workflowName,
		runId,
		resourceId,
		snapshot,
	}: {
		workflowName: string;
		runId: string;
		resourceId?: string;
		snapshot: WorkflowRunState;
	}): Promise<void> {
		const docRef = this.db
			.collection(TABLE_WORKFLOW_SNAPSHOT)
			.doc(`${workflowName}_${runId}`);

		await docRef.set(
			{
				workflowName,
				resourceId,
				...snapshot,
				updatedAt: new Date(),
			},
			{ merge: true },
		);
	}

	async loadWorkflowSnapshot({
		workflowName,
		runId,
	}: {
		workflowName: string;
		runId: string;
	}): Promise<WorkflowRunState | null> {
		const docRef = this.db
			.collection(TABLE_WORKFLOW_SNAPSHOT)
			.doc(`${workflowName}_${runId}`);
		const doc = await docRef.get();

		if (!doc.exists) {
			return null;
		}

		return this.deserializeWorkflowRunState(doc.data());
	}

	async getWorkflowRuns({
		workflowName,
		fromDate,
		toDate,
		limit = 50,
		offset = 0,
		resourceId,
	}: {
		workflowName?: string;
		fromDate?: Date;
		toDate?: Date;
		limit?: number;
		offset?: number;
		resourceId?: string;
	} = {}): Promise<WorkflowRuns> {
		let query = this.db.collection(
			TABLE_WORKFLOW_SNAPSHOT,
		) as FirebaseFirestore.Query;

		if (workflowName) {
			query = query.where("workflowName", "==", workflowName);
		}

		if (resourceId) {
			query = query.where("resourceId", "==", resourceId);
		}

		if (fromDate) {
			query = query.where("createdAt", ">=", fromDate);
		}

		if (toDate) {
			query = query.where("createdAt", "<=", toDate);
		}

		query = query.orderBy("createdAt", "desc");

		// Get total count
		const countSnapshot = await query.count().get();
		const total = countSnapshot.data().count;

		// Get paginated results
		const snapshot = await query.offset(offset).limit(limit).get();

		const runs = snapshot.docs.map((doc) =>
			this.deserializeWorkflowRun(doc.data()),
		);

		return {
			runs,
			total,
		} satisfies WorkflowRuns;
	}

	async getWorkflowRunById({
		runId,
		workflowName,
	}: {
		runId: string;
		workflowName?: string;
	}): Promise<WorkflowRun | null> {
		if (workflowName) {
			const docRef = this.db
				.collection(TABLE_WORKFLOW_SNAPSHOT)
				.doc(`${workflowName}_${runId}`);
			const doc = await docRef.get();

			if (!doc.exists) {
				return null;
			}

			return this.deserializeWorkflowRun(doc.data());
		}

		// If no workflow name provided, query by runId
		const query = this.db
			.collection(TABLE_WORKFLOW_SNAPSHOT)
			.where("runId", "==", runId)
			.limit(1);
		const snapshot = await query.get();

		if (snapshot.empty) {
			return null;
		}

		return this.deserializeWorkflowRun(snapshot.docs[0].data());
	}

	private deserializeWorkflowRunState(
		data: FirebaseFirestore.DocumentData | undefined,
	): WorkflowRunState {
		if (!data) {
			throw new Error("Workflow run state data is undefined");
		}

		return {
			runId: data.runId,
			status: data.status,
			result: data.result,
			runtimeContext: data.runtimeContext || {},
			error: data.error,
			suspendedPaths: data.suspendedPaths || {},
			waitingPaths: data.waitingPaths || {},
			timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
			value: data.value || {},
			context: data.context || {},
			serializedStepGraph: data.serializedStepGraph || [],
			activePaths: data.activePaths || [],
		} satisfies WorkflowRunState;
	}

	private deserializeWorkflowRun(
		data: FirebaseFirestore.DocumentData | undefined,
	): WorkflowRun {
		if (!data) {
			throw new Error("Workflow run data is undefined");
		}

		return {
			runId: data.runId,
			workflowName: data.workflowName,
			resourceId: data.resourceId,
			snapshot: this.deserializeWorkflowRunState(data.snapshot),
			createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
			updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
		} satisfies WorkflowRun;
	}
}

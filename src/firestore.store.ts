import type {
	MastraMessageContentV2,
	MastraMessageV2,
} from "@mastra/core/agent";
import type { MastraMessageV1, StorageThreadType } from "@mastra/core/memory";
import type { ScoreRowData, ScoringSource } from "@mastra/core/scores";
import type {
	AISpanRecord,
	AITraceRecord,
	AITracesPaginatedArg,
	EvalRow,
	PaginationArgs,
	PaginationInfo,
	StorageColumn,
	StorageDomains,
	StorageGetMessagesArg,
	StorageGetTracesArg,
	StoragePagination,
	StorageResourceType,
	TABLE_NAMES,
	ThreadSortOptions,
	WorkflowRun,
	WorkflowRuns,
} from "@mastra/core/storage";
import { MastraStorage } from "@mastra/core/storage";
import type { Trace } from "@mastra/core/telemetry";
import type { StepResult, WorkflowRunState } from "@mastra/core/workflows";
import type { Firestore } from "firebase-admin/firestore";
import { LegacyEvalsFirestore } from "./domains/legacy-evals.js";
import { MemoryFirestore } from "./domains/memory.js";
import { ObservabilityFirestore } from "./domains/observability.js";
import { StoreOperationsFirestore } from "./domains/operations.js";
import { ScoresFirestore } from "./domains/scores.js";
import { TracesFirestore } from "./domains/traces.js";
import { WorkflowsFirestore } from "./domains/workflows.js";

export type FirestoreConfig = {
	db: Firestore;
};

export class FirestoreStore extends MastraStorage {
	private db: Firestore;

	stores: StorageDomains;

	constructor(config: FirestoreConfig) {
		super({ name: `FirestoreStore` });

		this.db = config.db;

		const operations = new StoreOperationsFirestore({
			db: this.db,
		});

		const scores = new ScoresFirestore({ db: this.db });
		const traces = new TracesFirestore({ db: this.db });
		const workflows = new WorkflowsFirestore({ db: this.db });
		const memory = new MemoryFirestore({ db: this.db });
		const legacyEvals = new LegacyEvalsFirestore({ db: this.db });
		const observability = new ObservabilityFirestore({ operations });

		this.stores = {
			operations,
			scores,
			traces,
			workflows,
			memory,
			legacyEvals,
			observability,
		};
	}

	public get supports() {
		return {
			selectByIncludeResourceScope: true,
			resourceWorkingMemory: true,
			hasColumn: true,
			createTable: true,
			deleteMessages: true,
			aiTracing: true,
			getScoresBySpan: true,
		};
	}

	async createTable({
		tableName,
		schema,
	}: {
		tableName: TABLE_NAMES;
		schema: Record<string, StorageColumn>;
	}): Promise<void> {
		await this.stores.operations.createTable({ tableName, schema });
	}

	/**
	 * Alters table schema to add columns if they don't exist
	 * @param tableName Name of the table
	 * @param schema Schema of the table
	 * @param ifNotExists Array of column names to add if they don't exist
	 */
	async alterTable({
		tableName,
		schema,
		ifNotExists,
	}: {
		tableName: TABLE_NAMES;
		schema: Record<string, StorageColumn>;
		ifNotExists: string[];
	}): Promise<void> {
		await this.stores.operations.alterTable({ tableName, schema, ifNotExists });
	}

	async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
		await this.stores.operations.clearTable({ tableName });
	}

	async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
		await this.stores.operations.dropTable({ tableName });
	}

	public insert(args: {
		tableName: TABLE_NAMES;
		record: Record<string, unknown>;
	}): Promise<void> {
		return this.stores.operations.insert(args);
	}

	public batchInsert(args: {
		tableName: TABLE_NAMES;
		records: Record<string, unknown>[];
	}): Promise<void> {
		return this.stores.operations.batchInsert(args);
	}

	async load<R>({
		tableName,
		keys,
	}: {
		tableName: TABLE_NAMES;
		keys: Record<string, string>;
	}): Promise<R | null> {
		return this.stores.operations.load({ tableName, keys });
	}

	async getThreadById({
		threadId,
	}: {
		threadId: string;
	}): Promise<StorageThreadType | null> {
		return this.stores.memory.getThreadById({ threadId });
	}

	/**
	 * @deprecated use getThreadsByResourceIdPaginated instead for paginated results.
	 */
	public async getThreadsByResourceId(
		args: { resourceId: string } & ThreadSortOptions,
	): Promise<StorageThreadType[]> {
		return this.stores.memory.getThreadsByResourceId(args);
	}

	public async getThreadsByResourceIdPaginated(
		args: {
			resourceId: string;
			page: number;
			perPage: number;
		} & ThreadSortOptions,
	): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
		return this.stores.memory.getThreadsByResourceIdPaginated(args);
	}

	async saveThread({
		thread,
	}: {
		thread: StorageThreadType;
	}): Promise<StorageThreadType> {
		return this.stores.memory.saveThread({ thread });
	}

	async updateThread({
		id,
		title,
		metadata,
	}: {
		id: string;
		title: string;
		metadata: Record<string, unknown>;
	}): Promise<StorageThreadType> {
		return this.stores.memory.updateThread({ id, title, metadata });
	}

	async deleteThread({ threadId }: { threadId: string }): Promise<void> {
		return this.stores.memory.deleteThread({ threadId });
	}

	/**
	 * @deprecated use getMessagesPaginated instead for paginated results.
	 */
	public async getMessages(
		args: StorageGetMessagesArg & { format?: "v1" },
	): Promise<MastraMessageV1[]>;
	public async getMessages(
		args: StorageGetMessagesArg & { format: "v2" },
	): Promise<MastraMessageV2[]>;
	public async getMessages({
		threadId,
		selectBy,
		format,
	}: StorageGetMessagesArg & {
		format?: "v1" | "v2";
	}): Promise<MastraMessageV1[] | MastraMessageV2[]> {
		return this.stores.memory.getMessages({ threadId, selectBy, format });
	}

	async getMessagesById({
		messageIds,
		format,
	}: {
		messageIds: string[];
		format: "v1";
	}): Promise<MastraMessageV1[]>;
	async getMessagesById({
		messageIds,
		format,
	}: {
		messageIds: string[];
		format?: "v2";
	}): Promise<MastraMessageV2[]>;
	async getMessagesById({
		messageIds,
		format,
	}: {
		messageIds: string[];
		format?: "v1" | "v2";
	}): Promise<MastraMessageV1[] | MastraMessageV2[]> {
		return this.stores.memory.getMessagesById({ messageIds, format });
	}

	public async getMessagesPaginated(
		args: StorageGetMessagesArg & {
			format?: "v1" | "v2";
		},
	): Promise<
		PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }
	> {
		return this.stores.memory.getMessagesPaginated(args);
	}

	async saveMessages(args: {
		messages: MastraMessageV1[];
		format?: undefined | "v1";
	}): Promise<MastraMessageV1[]>;
	async saveMessages(args: {
		messages: MastraMessageV2[];
		format: "v2";
	}): Promise<MastraMessageV2[]>;
	async saveMessages(
		args:
			| { messages: MastraMessageV1[]; format?: undefined | "v1" }
			| { messages: MastraMessageV2[]; format: "v2" },
	): Promise<MastraMessageV2[] | MastraMessageV1[]> {
		return this.stores.memory.saveMessages(args);
	}

	async updateMessages({
		messages,
	}: {
		messages: (Partial<Omit<MastraMessageV2, "createdAt">> & {
			id: string;
			content?: {
				metadata?: MastraMessageContentV2["metadata"];
				content?: MastraMessageContentV2["content"];
			};
		})[];
	}): Promise<MastraMessageV2[]> {
		return this.stores.memory.updateMessages({ messages });
	}

	async deleteMessages(messageIds: string[]): Promise<void> {
		return this.stores.memory.deleteMessages(messageIds);
	}

	/** @deprecated use getEvals instead */
	async getEvalsByAgentName(
		agentName: string,
		type?: "test" | "live",
	): Promise<EvalRow[]> {
		return this.stores.legacyEvals.getEvalsByAgentName(agentName, type);
	}

	async getEvals(
		options: {
			agentName?: string;
			type?: "test" | "live";
		} & PaginationArgs = {},
	): Promise<PaginationInfo & { evals: EvalRow[] }> {
		return this.stores.legacyEvals.getEvals(options);
	}

	async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
		return this.stores.scores.getScoreById({ id });
	}

	async saveScore(
		score: Omit<ScoreRowData, "id" | "createdAt" | "updatedAt">,
	): Promise<{ score: ScoreRowData }> {
		return this.stores.scores.saveScore(score);
	}

	async getScoresByScorerId({
		scorerId,
		entityId,
		entityType,
		source,
		pagination,
	}: {
		scorerId: string;
		entityId?: string;
		entityType?: string;
		source?: ScoringSource;
		pagination: StoragePagination;
	}): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
		return this.stores.scores.getScoresByScorerId({
			scorerId,
			entityId,
			entityType,
			source,
			pagination,
		});
	}

	async getScoresByRunId({
		runId,
		pagination,
	}: {
		runId: string;
		pagination: StoragePagination;
	}): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
		return this.stores.scores.getScoresByRunId({ runId, pagination });
	}

	async getScoresByEntityId({
		entityId,
		entityType,
		pagination,
	}: {
		pagination: StoragePagination;
		entityId: string;
		entityType: string;
	}): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
		return this.stores.scores.getScoresByEntityId({
			entityId,
			entityType,
			pagination,
		});
	}

	/**
	 * TRACES
	 */

	/**
	 * @deprecated use getTracesPaginated instead.
	 */
	async getTraces(args: StorageGetTracesArg): Promise<Trace[]> {
		return this.stores.traces.getTraces(args);
	}

	async getTracesPaginated(
		args: StorageGetTracesArg,
	): Promise<PaginationInfo & { traces: Trace[] }> {
		return this.stores.traces.getTracesPaginated(args);
	}

	async batchTraceInsert(args: {
		records: Record<string, unknown>[];
	}): Promise<void> {
		return this.stores.traces.batchTraceInsert(args);
	}

	/**
	 * WORKFLOWS
	 */

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
		return this.stores.workflows.updateWorkflowResults({
			workflowName,
			runId,
			stepId,
			result,
			runtimeContext,
		});
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
		return this.stores.workflows.updateWorkflowState({
			workflowName,
			runId,
			opts,
		});
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
		return this.stores.workflows.persistWorkflowSnapshot({
			workflowName,
			runId,
			resourceId,
			snapshot,
		});
	}

	async loadWorkflowSnapshot({
		workflowName,
		runId,
	}: {
		workflowName: string;
		runId: string;
	}): Promise<WorkflowRunState | null> {
		return this.stores.workflows.loadWorkflowSnapshot({ workflowName, runId });
	}

	async getWorkflowRuns({
		workflowName,
		fromDate,
		toDate,
		limit,
		offset,
		resourceId,
	}: {
		workflowName?: string;
		fromDate?: Date;
		toDate?: Date;
		limit?: number;
		offset?: number;
		resourceId?: string;
	} = {}): Promise<WorkflowRuns> {
		return this.stores.workflows.getWorkflowRuns({
			workflowName,
			fromDate,
			toDate,
			limit,
			offset,
			resourceId,
		});
	}

	async getWorkflowRunById({
		runId,
		workflowName,
	}: {
		runId: string;
		workflowName?: string;
	}): Promise<WorkflowRun | null> {
		return this.stores.workflows.getWorkflowRunById({ runId, workflowName });
	}

	async getResourceById({
		resourceId,
	}: {
		resourceId: string;
	}): Promise<StorageResourceType | null> {
		return this.stores.memory.getResourceById({ resourceId });
	}

	async saveResource({
		resource,
	}: {
		resource: StorageResourceType;
	}): Promise<StorageResourceType> {
		return this.stores.memory.saveResource({ resource });
	}

	async updateResource({
		resourceId,
		workingMemory,
		metadata,
	}: {
		resourceId: string;
		workingMemory?: string;
		metadata?: Record<string, unknown>;
	}): Promise<StorageResourceType> {
		return this.stores.memory.updateResource({
			resourceId,
			workingMemory,
			metadata,
		});
	}

	async createAISpan(span: AISpanRecord): Promise<void> {
		return this.stores.observability!.createAISpan(span);
	}

	async updateAISpan(params: {
		spanId: string;
		traceId: string;
		updates: Partial<Omit<AISpanRecord, "spanId" | "traceId">>;
	}): Promise<void> {
		return this.stores.observability?.updateAISpan(params);
	}

	async getAITrace(traceId: string): Promise<AITraceRecord | null> {
		return this.stores.observability!.getAITrace(traceId);
	}

	async getAITracesPaginated(
		args: AITracesPaginatedArg,
	): Promise<{ pagination: PaginationInfo; spans: AISpanRecord[] }> {
		return this.stores.observability!.getAITracesPaginated(args);
	}

	async getScoresBySpan({
		traceId,
		spanId,
		pagination,
	}: {
		traceId: string;
		spanId: string;
		pagination: StoragePagination;
	}): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
		return this.stores.scores.getScoresBySpan({ traceId, spanId, pagination });
	}

	async batchCreateAISpans(args: { records: AISpanRecord[] }): Promise<void> {
		return this.stores.observability!.batchCreateAISpans(args);
	}

	async batchUpdateAISpans(args: {
		records: {
			traceId: string;
			spanId: string;
			updates: Partial<Omit<AISpanRecord, "spanId" | "traceId">>;
		}[];
	}): Promise<void> {
		return this.stores.observability!.batchUpdateAISpans(args);
	}
}

import {
	type AISpanRecord,
	type AITraceRecord,
	type AITracesPaginatedArg,
	ObservabilityStorage,
	type PaginationInfo,
	TABLE_AI_SPANS,
	TABLE_TRACES,
} from "@mastra/core/storage";
import type { StoreOperationsFirestore } from "./operations.js";

export interface ObservabilityFirestoreConfig {
	operations: StoreOperationsFirestore;
}

export class ObservabilityFirestore extends ObservabilityStorage {
	private operations: StoreOperationsFirestore;

	constructor(config: ObservabilityFirestoreConfig) {
		super();
		this.operations = config.operations;
	}

	async createAISpan(span: AISpanRecord): Promise<void> {
		await this.operations.insert({
			tableName: TABLE_AI_SPANS,
			record: {
				...span,
				createdAt: span.createdAt || new Date(),
			},
		});
	}

	async updateAISpan(params: {
		spanId: string;
		traceId: string;
		updates: Partial<Omit<AISpanRecord, "spanId" | "traceId">>;
	}): Promise<void> {
		const { spanId, traceId, updates } = params;

		// Load existing span
		const existingSpan = await this.operations.load<AISpanRecord>({
			tableName: TABLE_AI_SPANS,
			keys: { spanId, traceId },
		});

		if (!existingSpan) {
			throw new Error(`Span ${spanId} in trace ${traceId} not found`);
		}

		// Merge updates
		const updatedSpan = {
			...existingSpan,
			...updates,
			spanId,
			traceId,
			updatedAt: new Date(),
		};

		// Save updated span
		await this.operations.insert({
			tableName: TABLE_AI_SPANS,
			record: updatedSpan,
		});
	}

	async getAITrace(traceId: string): Promise<AITraceRecord | null> {
		return this.operations.load<AITraceRecord>({
			tableName: TABLE_TRACES,
			keys: { traceId },
		});
	}

	async getAITracesPaginated(
		args: AITracesPaginatedArg,
	): Promise<{ pagination: PaginationInfo; spans: AISpanRecord[] }> {
		const { filters, pagination } = args;
		const { page = 1, perPage = 20 } = pagination || {};
		const { name, spanType, entityId, entityType } = filters || {};

		const keys: Record<string, string> = {};
		if (name !== undefined) keys.name = name;
		if (spanType !== undefined) keys.spanType = spanType;
		if (entityId !== undefined) keys.entityId = entityId;
		if (entityType !== undefined) keys.entityType = entityType;

		const allSpans = await this.operations.load<AISpanRecord[]>({
			tableName: TABLE_AI_SPANS,
			keys,
		});

		const spans = allSpans || [];
		const totalCount = spans.length;
		const offset = (page - 1) * perPage;
		const paginatedSpans = spans.slice(offset, offset + perPage);

		return {
			spans: paginatedSpans,
			pagination: {
				page,
				perPage,
				total: totalCount,
				hasMore: totalCount > offset + perPage,
			},
		};
	}

	async batchCreateAISpans(args: { records: AISpanRecord[] }): Promise<void> {
		const records = args.records.map((span) => ({
			...span,
			createdAt: span.createdAt || new Date(),
		}));

		await this.operations.batchInsert({
			tableName: TABLE_AI_SPANS,
			records,
		});
	}

	async batchUpdateAISpans(args: {
		records: {
			traceId: string;
			spanId: string;
			updates: Partial<Omit<AISpanRecord, "spanId" | "traceId">>;
		}[];
	}): Promise<void> {
		const { records } = args;

		for (const { spanId, traceId, updates } of records) {
			await this.updateAISpan({ spanId, traceId, updates });
		}
	}
}

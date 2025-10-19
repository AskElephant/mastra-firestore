import {
	type StorageColumn,
	StoreOperations,
	type TABLE_NAMES,
} from "@mastra/core/storage";
import type { Firestore } from "firebase-admin/firestore";

export interface StoreOperationsFirestoreConfig {
	db: Firestore;
}

export class StoreOperationsFirestore extends StoreOperations {
	private db: Firestore;

	constructor(config: StoreOperationsFirestoreConfig) {
		super();
		this.db = config.db;
	}

	hasColumn(table: string, column: string): Promise<boolean> {
		throw new Error("Method not implemented.");
	}

	async createTable({
		tableName,
		schema,
	}: {
		tableName: TABLE_NAMES;
		schema: Record<string, StorageColumn>;
	}): Promise<void> {
		// Firestore doesn't require explicit table creation
		// Collections are created automatically when documents are added
		// We can store the schema metadata if needed
		const metadataRef = this.db.collection("_metadata").doc(tableName);
		await metadataRef.set({
			schema,
			createdAt: new Date(),
		});
	}

	async alterTable({
		tableName,
		schema,
		ifNotExists,
	}: {
		tableName: TABLE_NAMES;
		schema: Record<string, StorageColumn>;
		ifNotExists: string[];
	}): Promise<void> {
		// Firestore is schemaless, so we just update the metadata
		const metadataRef = this.db.collection("_metadata").doc(tableName);
		const doc = await metadataRef.get();

		if (doc.exists) {
			const existingSchema = doc.data()?.schema || {};
			const updatedSchema = { ...existingSchema };

			for (const columnName of ifNotExists) {
				if (!(columnName in existingSchema) && columnName in schema) {
					updatedSchema[columnName] = schema[columnName];
				}
			}

			await metadataRef.update({
				schema: updatedSchema,
				updatedAt: new Date(),
			});
		}
	}

	async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
		const collectionRef = this.db.collection(tableName);
		const batchSize = 500;

		const deleteQueryBatch = async () => {
			const snapshot = await collectionRef.limit(batchSize).get();

			if (snapshot.size === 0) {
				return 0;
			}

			const batch = this.db.batch();
			snapshot.docs.forEach((doc) => {
				batch.delete(doc.ref);
			});

			await batch.commit();
			return snapshot.size;
		};

		let deletedCount = 0;
		do {
			deletedCount = await deleteQueryBatch();
		} while (deletedCount >= batchSize);
	}

	async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
		await this.clearTable({ tableName });

		// Also delete the metadata
		const metadataRef = this.db.collection("_metadata").doc(tableName);
		await metadataRef.delete();
	}

	async insert({
		tableName,
		record,
	}: {
		tableName: TABLE_NAMES;
		record: Record<string, unknown>;
	}): Promise<void> {
		const collectionRef = this.db.collection(tableName);

		if (record.id && typeof record.id === "string") {
			await collectionRef.doc(record.id).set(this.serializeRecord(record));
		} else {
			await collectionRef.add(this.serializeRecord(record));
		}
	}

	async batchInsert({
		tableName,
		records,
	}: {
		tableName: TABLE_NAMES;
		records: Record<string, unknown>[];
	}): Promise<void> {
		const collectionRef = this.db.collection(tableName);
		const batchSize = 500; // Firestore limit

		for (let i = 0; i < records.length; i += batchSize) {
			const batch = this.db.batch();
			const batchRecords = records.slice(i, i + batchSize);

			for (const record of batchRecords) {
				if (record.id && typeof record.id === "string") {
					const docRef = collectionRef.doc(record.id);
					batch.set(docRef, this.serializeRecord(record));
				} else {
					const docRef = collectionRef.doc();
					batch.set(docRef, this.serializeRecord(record));
				}
			}

			await batch.commit();
		}
	}

	async load<R>({
		tableName,
		keys,
	}: {
		tableName: TABLE_NAMES;
		keys: Record<string, string>;
	}): Promise<R | null> {
		const collectionRef = this.db.collection(tableName);

		// If there's an 'id' key, use direct document lookup
		if (keys.id) {
			const docRef = collectionRef.doc(keys.id);
			const doc = await docRef.get();

			if (!doc.exists) {
				return null;
			}

			return this.deserializeRecord(doc.data()) as R;
		}

		// Otherwise, query by the provided keys
		let query: FirebaseFirestore.Query = collectionRef;

		for (const [key, value] of Object.entries(keys)) {
			query = query.where(key, "==", value);
		}

		const snapshot = await query.limit(1).get();

		if (snapshot.empty) {
			return null;
		}

		return this.deserializeRecord(snapshot.docs[0].data()) as R;
	}

	private serializeRecord(
		record: Record<string, unknown>,
	): Record<string, unknown> {
		const serialized: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(record)) {
			if (value instanceof Date) {
				serialized[key] = value;
			} else if (value === null || value === undefined) {
				serialized[key] = null;
			} else if (typeof value === "object") {
				// Serialize objects as JSON strings if they're not plain objects
				serialized[key] = JSON.parse(JSON.stringify(value));
			} else {
				serialized[key] = value;
			}
		}

		return serialized;
	}

	private deserializeRecord(
		data: FirebaseFirestore.DocumentData | undefined,
	): Record<string, unknown> {
		if (!data) {
			return {};
		}

		const deserialized: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(data)) {
			if (value && typeof value === "object" && "_seconds" in value) {
				// Firestore timestamp
				deserialized[key] = new Date(value._seconds * 1000);
			} else {
				deserialized[key] = value;
			}
		}

		return deserialized;
	}
}

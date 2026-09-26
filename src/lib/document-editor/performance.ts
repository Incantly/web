export type DocumentPerformancePhase = 'editor-create' | 'first-editable' | 'typing' | 'selection' | 'paste' | 'undo' | 'serialization' | 'teardown'
export interface DocumentPerformanceSample { phase: DocumentPerformancePhase; duration: number; timestamp: number }
export class DocumentPerformanceRecorder {
  readonly samples: DocumentPerformanceSample[] = []
  measure<T>(phase: DocumentPerformancePhase, operation: () => T): T { const start = performance.now(); try { return operation() } finally { this.samples.push({ phase, duration: performance.now() - start, timestamp: Date.now() }) } }
  async measureAsync<T>(phase: DocumentPerformancePhase, operation: () => Promise<T>): Promise<T> { const start = performance.now(); try { return await operation() } finally { this.samples.push({ phase, duration: performance.now() - start, timestamp: Date.now() }) } }
  summary() { return Object.fromEntries(Array.from(new Set(this.samples.map((item) => item.phase))).map((phase) => { const values = this.samples.filter((item) => item.phase === phase).map((item) => item.duration).sort((a, b) => a - b); return [phase, { count: values.length, p95: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0, max: values.at(-1) ?? 0 }] })) }
}

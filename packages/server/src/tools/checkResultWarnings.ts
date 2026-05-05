export function checkResultWarnings(result: unknown, warnings: string[], maxLimit: number) {
  if (Array.isArray(result) && result.length === maxLimit) {
    warnings.push(
      `Query returned exactly ${maxLimit} rows — there may be more results. Use .limit() and .offset() to paginate.`,
    );
  }
}

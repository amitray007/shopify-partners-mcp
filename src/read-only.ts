import { Kind, parse } from "graphql";

export function assertReadOnlyQuery(query: string): void {
  const document = parse(query);
  for (const definition of document.definitions) {
    if (
      definition.kind === Kind.OPERATION_DEFINITION &&
      definition.operation !== "query"
    ) {
      throw new Error(
        `Only queries are allowed; found a ${definition.operation}`
      );
    }
  }
}

export class DurableObject {
  ctx: DurableObjectState;
  env: unknown;

  constructor(ctx: DurableObjectState, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}

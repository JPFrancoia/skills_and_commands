# BTW documentation

## Screenshot

[View the BTW overlay](btw-overlay.png).

## Model inheritance

BTW uses the parent model by default. This includes virtual models such as `jev/auto`.

For a virtual model, BTW chat and summaries use the parent model runtime. The runtime keeps the router and its provider registrations available.

BTW keeps its messages and routing state separate from the parent session. Child tools also keep their BTW-specific limits. Summary sessions have no tools.

Router callbacks keep their parent extension context. This lets the router use the context that registered it.

Pi does not expose the owning runtime through a public registry API. BTW reads the private registry `runtime` field and checks that it contains the selected virtual model. If the field or model is unavailable, BTW reports an error and asks you to select a physical model.

Use `/btw:model <provider> <model> <api>` to select a physical model for BTW. Use `/btw:model clear` to return to model inheritance.

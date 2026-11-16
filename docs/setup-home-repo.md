# Set Up a Home Repository

Use `/skill:setup-home-repo <target>` to create or extend one project repository. A home repository is a project repository. It is not the user's home directory. The repository holds project source and shared context under one Git owner.

A Git owner is the repository that tracks files. A component is a project folder with a distinct role. A monorepo stores multiple components in one repository. An architecture decision record (ADR) explains a design choice and its reasons.

## Start

1. Name the target in the command: `/skill:setup-home-repo <target>`.
2. Let the skill inspect the target before it edits files.
3. Review its component map, proposed shared files, selected tools, and excluded work.
4. Answer questions about choices that affect scope, project rules, delivery, or tools.

The skill reads local rules, the root README, documentation indexes, source folders, ignore rules, plans, tools, and checks. An ignore rule hides matching new files from Git's default file list. If `docs/CONTEXT.md` exists, the skill uses its terms before it drafts text.

The skill asks questions only when existing files do not answer them. It inspects first, then asks about unresolved choices. It preserves established paths and policies. It uses reversible defaults for low-risk details.

## Shared layout

The skill creates or extends shared documents alongside project source in the same Git repository. The baseline includes `README.md`, `AGENTS.md`, a glossary, documentation indexes, ADR guidance, and a plans index.

A glossary defines shared terms. A plan records implementation work. An ADR records a design choice. Draft ADRs await human review. Accepted ADRs record decisions. Reference documents describe implemented behavior. The skill keeps these roles distinct and preserves equivalent paths already in use.

The skill preserves existing source paths. It does not impose `apps/` or `packages/`, create source scaffolding, or add a build tool. It keeps component source visible to Git. The skill adds only selected optional tools. These tools include shared skills, Pi skill discovery, diagram sources, and extra checks.

## Safe boundaries

The skill requires one Git owner for the project source and shared context. The skill stops before edits in these cases:

- An ancestor repository owns the target.
- Source contains a nested Git owner or submodule.
- Ignore rules hide intended source.

A submodule is a separate Git repository referenced by its containing repository. It asks for a separate decision about ownership or ignore-rule changes. It does not convert independent repositories or add broad ignore exceptions.

The skill preserves existing content and Git state outside approved changes. It does not stage files or change the Git index without explicit authority. The Git index is Git's staging area for the next commit. The skill keeps setup local and asks before external changes, such as creating remotes, pushing, or deploying.

The skill does not change user-level configuration. In an open Pi session, run `/reload` to refresh skill discovery.

## Repeat setup

Run the skill again with the same answers when needed. It avoids duplicate sections, files, and ignore entries. An unchanged project needs no further edits.

## Behavior scenarios

The skill includes [behavior scenarios](../skills/setup-home-repo/references/scenarios.md). A fixture is a disposable test workspace with known files and Git state. The scenarios cover a new repository, repeat setup, incompatible ownership, and hidden source. They also list additional review cases.

See [Set up a root repository](setup-root-repo.md) for a workspace root that holds shared files for independent nested repositories. Unlike a home repository, a workspace root does not own the nested repositories' source.

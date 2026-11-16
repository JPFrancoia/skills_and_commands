# Set Up a Root Repository

Use `/skill:setup-root-repo <target>` to create or extend a workspace root. A workspace root is a Git repository for shared project files. The skill inspects the target before it edits files.

A nested repository is an independent Git repository inside the root. The root does not track nested source files.

## Start

1. Name the target in the command: `/skill:setup-root-repo <target>`.
2. Read the ownership map and existing conventions from the skill.
3. Answer questions about choices that affect scope, ownership, delivery, or tools.
4. Review the proposed file list and defaults before setup changes.

The skill asks questions only when existing files do not give an answer. Questions cover the project map, delivery, agent files, optional tools, document moves, and checks. Each question has two to four choices. The skill marks one choice as recommended.

## Baseline and optional choices

The baseline includes `README.md`, `AGENTS.md`, a glossary, documentation indexes, ADR guidance, and a plans index. A glossary defines shared terms. An architecture decision record (ADR) records a design choice and its reasons. The skill preserves equivalent paths and indexes.

Optional tools include matching `CLAUDE.md` and `AGENTS.md` files, shared skills, Pi skill discovery, diagram sources, and extra checks. The skill creates only selected tools. It uses reversible defaults for low-risk details.

The skill uses one glossary. It preserves the current glossary path. If both `docs/CONTEXT.md` and `GLOSSARY.md` exist, it establishes which file has authority before it adds terms.

## Safe boundaries

The skill keeps setup local. A delivery choice does not permit publication. The skill asks before it creates remotes, changes access, pushes, opens pull requests, or deploys.

The skill keeps nested repositories independent. It does not add submodules or copy their source into the root. If the root tracks nested source files, the skill stops and asks about repository ownership. It also stops if an ancestor repository owns the target. The skill asks before it changes a managed symbolic link.

The Git index is Git’s staging area. The skill does not change it without clear approval. The skill preserves existing content through targeted edits. It does not change user-level settings. It keeps existing documents in place unless the user approves specific moves.

## Repeated setup

Run the skill again with the same answers when needed. It preserves existing conventions and avoids duplicate sections and ignore entries. An unchanged workspace needs no further edits.

## Fixture scenarios

The skill includes [behavior scenarios](../skills/setup-root-repo/references/scenarios.md). A fixture is a temporary local workspace with known files and Git state. Keep fixtures outside real example workspaces and the implementation repository.

For each scenario, read the skill and apply it to a separate fixture. Do not use a file-copy script instead. The scenarios cover a new workspace, repeat setup, and incompatible repository ownership. Record which scenarios ran and which remain untested.

In an open Pi session, run `/reload` to refresh skill discovery.

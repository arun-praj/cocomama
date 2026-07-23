## DO NOT CONSIDER BACKWARDS COMPATIBILITY. IGNORE LAGACY CODE/LIBRARY.

## CODE STYLE

1. Typescript Stric
2. Single quotes, no semicolons, no trailing commas
3. Use functional patterns where possible

## RULES FOR ANY AI

1. If you are confused always ask for clarification before proceeding. Man in the middle pattern.
2. Always kill the spawned terminal after the command is executed. Do not leave it running. Like when you are running a build command or test command.
3. Always document any changes made to the codebase, including the reasoning behind them. Make a new MD file if not found names "Changelog.md" in the root of the project. If found, append to it.
4. For AI tool-call parsing or execution bugs, never patch only the specific observed prompt or JSON example. Generalize the normalization and execution path across equivalent tool payload shapes, then add regression coverage for that class of issue.

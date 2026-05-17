# Scan Repo Workflow

## Purpose
Coordinates Scan Repo-related workflow behavior.

## Owned files
- packages/core/src/scanner/scanRepo.ts

## Dependencies
- utility.load.config
- workflow.detect.imports
- workflow.detect.package.info
- workflow.detect.routes
- workflow.detect.tests

## AI notes
- Search this node before creating new scan.repo logic.
- Expand owned files only when implementation details are needed.
- Files remain the source of truth.

## Evidence
- packages/core/src/scanner/scanRepo.ts: Folder name "scanner" indicates workflow ownership.

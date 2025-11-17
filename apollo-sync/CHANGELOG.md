# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.68] - 2025-11-15

### Fixed
- **CRITICAL FIX**: Company sync now works - can create new accounts (not just update existing)
- **CRITICAL FIX**: Company sync no longer requires domain - uses name matching as primary method
- **CRITICAL FIX**: Deal sync now properly resolves Apollo account ID from Attio company record ID
- Improved company matching logic to prioritize exact name matches
- Better error handling for company and deal sync operations

### Improved
- Company sync now searches by name first (more reliable than domain)
- Company sync can create new accounts if they don't exist in Apollo
- Deal sync automatically looks up Apollo account ID when deal has associated company
- Better logging for company and deal sync operations

## [1.67] - 2025-11-15

### Fixed
- **CRITICAL FIX**: Deal matching logic - fixed issue where all Attio deals were syncing to the same Apollo deal
- Removed fallback to first search result which was causing incorrect deal matching
- Added Attio record ID matching in description field for reliable deal identification
- Improved deal matching to consider both name and account_id when available
- Fixed TypeScript errors throughout the codebase

### Improved
- Deal matching now prioritizes Attio record ID in description (most reliable)
- Falls back to exact name + account_id matching if record ID not found
- Better logging for deal matching operations
- Stores Attio record ID in Apollo deal description for future matching

## [1.66] - 2025-11-15

### Fixed
- Deal stage syncing improvements from version 0.0.2
- All deal stages now properly sync between Attio and Apollo

## [0.0.2] - 2025-11-15

### Added
- Explicit deal stage mappings between Attio and Apollo for all 8 standard stages:
  - NS/Reschedule
  - Discovery Call Booked
  - Proposal Sent
  - Negotiation
  - Contract Sent
  - Closed Won
  - Closed Lost
  - On Hold

### Improved
- Enhanced deal stage mapping logic with case-insensitive matching
- Improved stage ID lookup with better error handling
- Added fallback to `stage_name` when `stage_id` cannot be found
- Better logging for stage mapping operations
- Whitespace trimming for stage names

### Fixed
- Deal stages now properly sync from Attio to Apollo when changed
- Stage mapping now prioritizes exact matches from manual mappings
- Improved handling of stage updates when Apollo stage ID lookup fails

## [0.0.1] - Initial Release

Initial version of the Apollo-Attio sync integration.


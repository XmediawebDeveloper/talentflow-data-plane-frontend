'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Legacy route — My Resumes is now a tab of Resume Database. Open that tab and
// keep the rest of the query string (folder_id, resume_id, batch_id …, which
// the tab reads the same way) so existing bookmarks and links keep working.
export default function MyResumesLegacyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'my-resumes');
    router.replace(`/recruitment/resume-database?${params.toString()}`);
  }, [router, searchParams]);

    return (
      <NoResumesEmptyState
        description={
          isArchivedResumesFolder
            ? ''
            : canUploadMyResumes
              ? 'No resumes are available in this folder yet. Add a resume to get started.'
              : 'No resumes are available in this folder yet.'
        }
        onAction={isArchivedResumesFolder || !canUploadMyResumes ? undefined : () => openUploadToFolder(folderId)}
      />
    );
  };

  /* Display path of the folder the refused upload was aimed at, for the
     "New Resume (Uploading)" card in the duplicate dialog. `pendingUploadFolderId`
     is the id the upload actually used, which `handleUploadResumes` has already
     resolved to the root folder when the user picked "All Resumes" or nothing —
     so an empty breadcrumb means root, not "unknown". The "My Resumes /" prefix
     matches the shape the backend returns in `folder_path` for the other card. */
  const pendingUploadFolderPath = useMemo(() => {
    if (pendingUploadFolderLabel) return `My Resumes / ${pendingUploadFolderLabel}`;
    const segments = buildBreadcrumbPath(pendingUploadFolderId ?? null).map(f => f.name);
    return ['My Resumes', ...(segments.length > 0 ? segments : ['root'])].join(' / ');
  }, [pendingUploadFolderLabel, pendingUploadFolderId, buildBreadcrumbPath]);

  const selectedCardFolderFilterLabel = CARD_FOLDER_FILTER_OPTIONS.find(option => option.value === cardFolderFilter)?.label;
  const gridToolbarFilterChips =
    cardFolderFilter !== 'all' && selectedCardFolderFilterLabel
      ? [{ key: 'folder-filter', label: `Folder: ${selectedCardFolderFilterLabel}`, onClear: () => setCardFolderFilter('all') }]
      : [];

  // Handle duplicate resolution
  const handleResolveDuplicates = async (resolutions: { fileIndex: number; action: 'discard' | 'overwrite' | 'version' }[]) => {
    /* No "Processing duplicate resolution..." loading toast here — the
       DuplicateResumeModal's Confirm All/Continue button shows its own
       loading state while this runs, so a floating toast on top of it was
       redundant. Only the final outcome gets a toast. */
    // Same as a plain upload: whatever batch this creates has to be claimed,
    // or the ownership filter will read it as another account's.
    const priorBatchIds = await snapshotBatchIds();

    try {
      let discardedCount = 0;
      let overwrittenCount = 0;
      let versionedCount = 0;

      for (const resolution of resolutions) {
        const duplicateFile = duplicateFiles[resolution.fileIndex];
        if (!duplicateFile) continue;

        if (resolution.action === 'discard') {
          // Just skip this file
          discardedCount += 1;
        } else {
          // Use the resolve duplicate and upload endpoint
          await resumeService.resolveDuplicateAndUpload(
            duplicateFile.file,
            duplicateFile.existingResume.id,
            resolution.action,
            pendingUploadFolderId
          );

          if (resolution.action === 'overwrite') {
            overwrittenCount += 1;
          } else {
            versionedCount += 1;
          }
        }
      }

      const summaryParts = [
        discardedCount > 0 && `${discardedCount} discarded`,
        overwrittenCount > 0 && `${overwrittenCount} overwritten`,
        versionedCount > 0 && `${versionedCount} saved as new version${versionedCount > 1 ? 's' : ''}`,
      ].filter(Boolean);
      if (summaryParts.length > 0) {
        toast.success(`Duplicate resolution complete: ${summaryParts.join(', ')}`);
      }

      // Refresh full list from server to get correct data
      setTimeout(async () => {
        isFetchingRef.current = false;
        fetchData(appliedSearchQuery, filters, selectedFolder, true);
        refreshAllResumesTotal();
        await adoptNewBatchIds(priorBatchIds);
        fetchUploadHistory();
      }, 500);
    } catch (error: any) {
      console.error('Error resolving duplicates:', error);
      toast.error('Failed to resolve duplicate');
    } finally {
      setDuplicateFiles([]);
      setPendingUploadFolderId(undefined);
      setPendingUploadFolderLabel(undefined);
      setIsDuplicateModalOpen(false);
    }
  };

  if (loading) {
    // Structure-matched skeleton mirroring the real My Resumes page: same
    // outer wrapper / white card, the same header block (icon box, title +
    // count chip, subtitle, the two action buttons), the search toolbar row,
    // then the shared ResumeTableSkeleton in place of the ResumeTable.
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Breadcrumb */}
            <Skeleton className="h-4 w-48 mb-4 md:mb-6" />
            {/* Header row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
              <div className="w-full sm:w-auto flex items-start gap-3">
                <Skeleton className="hidden sm:block h-9 w-9 rounded-lg flex-shrink-0" />
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Skeleton className="h-9 w-32 rounded-md flex-1 sm:flex-initial" />
                <Skeleton className="h-9 w-32 rounded-md flex-1 sm:flex-initial" />
              </div>
            </div>
            {/* Search / toolbar card */}
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 flex-1 rounded-lg" />
                <Skeleton className="h-10 w-28 rounded-lg" />
                <Skeleton className="hidden sm:block h-10 w-20 rounded-lg" />
              </div>
            </div>
            {/* The resume table, as its own matching skeleton */}
            <ResumeTableSkeleton rows={8} />
          </div>
        </div>
      </main>
    );
  }

  /* Upload History is only actionable once THIS user has uploaded something.
     The signal is their own unfiltered resume total (`allResumesTotal` comes
     from the user-scoped `source: 'my-resumes'` list, refreshed only when no
     folder/search/filter narrows it) plus any upload started in this session.
     Deliberately NOT the batches endpoint: `/resumes/upload/batches` takes no
     owner filter, so in a shared tenant it hands a brand-new user everyone
     else's batches — which is exactly what kept this button enabled. */
  const hasUploadHistory = allResumesTotal > 0 || uploadStartedThisSession;

  return (
    <FeatureGate feature="resume_upload">
    <DndProvider backend={HTML5Backend}>
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'My Resumes' }]} />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="w-full sm:w-auto flex items-start gap-3">
          <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
            <FileText className="h-4 w-4 text-brand-blue" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">My Resume Database</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                {totalItems} Resumes
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">Resumes uploaded by you</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {canViewMyResumes && (
            <button
              onClick={openUploadHistoryModal}
              disabled={!hasUploadHistory}
              title={hasUploadHistory ? 'View upload history' : 'No uploads yet'}
              className={`relative flex items-center justify-center gap-1.5 bg-white px-3 py-2 rounded-md border transition-colors text-sm flex-1 sm:flex-initial ${
                hasUploadHistory
                  ? 'text-gray-700 border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue cursor-pointer'
                  : 'text-gray-400 border-gray-200 opacity-60 cursor-not-allowed'
              }`}
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Upload History</span>
              <span className="sm:hidden">History</span>
              {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-cyan/60 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-brand-cyan text-white text-2xs items-center justify-center">
                    {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length}
                  </span>
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (!canUploadMyResumes) {
                toast.error('You do not have permission to upload resumes');
                return;
              }
              openUploadToFolder(undefined);
            }}
            aria-disabled={!canUploadMyResumes}
            title={!canUploadMyResumes ? 'You do not have permission to upload resumes' : undefined}
            className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-md transition-all text-sm flex-1 sm:flex-initial shadow-sm ring-1 ${
              canUploadMyResumes
                ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-brand-blue/25 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer'
                : 'bg-gray-200 text-gray-400 shadow-none ring-transparent cursor-not-allowed opacity-60'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Upload Resume</span>
            <span className="sm:hidden">Upload</span>
          </button>
        </div>
      </div>

      {/* tf-round-edges instead of overflow-hidden: overflow-hidden makes this
          card a scroll container, which the sticky search bar below would pin to
          (scrolling away with the card) instead of to the page. tf-round-edges
          keeps the rounded corners without creating that scroll container. */}
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 tf-round-edges">
        {/* Bulk Actions Bar - Shows at TOP when resumes selected */}
        {selectedResumes.length > 0 && (() => {
          // Detect the Archived Resumes folder context — when active, the
          // recruiter is looking at archived resumes, so swap Archive → Unarchive
          // and hide Apply-to-Job / Assessment / AI Talent Match (those actions
          // shouldn't apply to retired records).
          const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);
          const isArchivedContext =
            !!archivedFolder &&
            (selectedFolder === archivedFolder.id ||
              selectedResumes.every(id => resumes.find(r => r.id === id)?.isArchived));
          return (
          <BulkActionsBar
            selectedCount={selectedResumes.length}
            onCancel={() => setSelectedResumes([])}
            onMoveToFolder={canMoveMyResumes ? (folderId) => handleMoveToFolder(selectedResumes, folderId) : undefined}
            onApplyToJob={!isArchivedContext && (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:score'))) ? handleApplyToJob : undefined}
            onApplyToJobDisabled={isPlanLocked('resume_scoring')}
            onApplyToJobDisabledReason={PLAN_LOCKED_MESSAGE}
            onDownload={handleBulkDownload}
            onDelete={canDeleteMyResumes ? () => handleDeleteResumes(selectedResumes) : undefined}
            folders={folders.filter(f => f.id !== 'all')}
            onAssessment={!isArchivedContext && (isTenantAdmin || (hasPermission('canCreateAssessments') && hasPermissionCode('my_resumes:assessment'))) ? handleAssessment : undefined}
            onAssessmentDisabled={isPlanLocked('assessment')}
            onAssessmentDisabledReason={PLAN_LOCKED_MESSAGE}
            onArchive={!isArchivedContext && canArchiveMyResumes ? () => setIsArchiveModalOpen(true) : undefined}
            onUnarchive={isArchivedContext && canArchiveMyResumes ? () => handleUnarchiveResumes(selectedResumes) : undefined}
            onAITalentMatch={!isArchivedContext && (isTenantAdmin || (hasPermission('canRunAiMatch') && hasPermissionCode('my_resumes:ai_match'))) ? handleAITalentMatch : undefined}
            onAITalentMatchDisabled={isPlanLocked('ai_talent_match')}
            onAITalentMatchDisabledReason={PLAN_LOCKED_MESSAGE}
            // No `my_resumes:ai_interview` action code exists yet, so this
            // follows the AI Interviews module's own share permission.
            onAIInterview={!isArchivedContext && (isTenantAdmin || (hasPermission('canInviteAIInterviews') && hasPermissionCode('my_resumes:invite_ai_interview'))) ? handleAIInterview : undefined}
            onAIInterviewDisabled={isPlanLocked('ai_interview')}
            onAIInterviewDisabledReason={PLAN_LOCKED_MESSAGE}
          />
          );
        })()}

        {/* Search pinned to the top of the scroll viewport so it stays reachable
            while the list scrolls beneath it. Opaque bg so rows don't show
            through; z above the rows. */}
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white p-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-start">
              <div className="min-w-0 flex-1">
                <UnifiedFolderResumeSearch
                  query={searchQuery}
                  onQueryChange={handleSearchChange}
                  onClear={() => handleSearchChange('')}
                  folders={folders}
                  resumes={resumes}
                  isLoading={loading || isPaginating}
                  onSelectFolder={(folderId) => {
                    if (viewMode === 'card') {
                      navigateToFolder(folderId);
                    } else {
                      setSelectedFolder(folderId);
                      setCurrentPage(1);
                    }
                  }}
                  onSelectResume={(resume) => {
                    sessionStorage.setItem('resumeNavList', JSON.stringify(resumes.map((r) => r.id)));
                    sessionStorage.setItem('resumeNavSource', 'my-resumes');
                    router.push(`/recruitment/resume-view/${resume.id}`);
                  }}
                />
              </div>

              {/* Folders only. The resume filter that sat beside it is gone —
                  the search box and the Filter panel already narrow resumes. */}
              {viewMode === 'card' && (
                <div className="grid w-full grid-cols-1 gap-2 xl:w-auto xl:min-w-[190px]">
                  <ToolbarFilterSelect<CardFolderFilter>
                    label="Folder Filters"
                    value={cardFolderFilter}
                    options={CARD_FOLDER_FILTER_OPTIONS}
                    onChange={setCardFolderFilter}
                    icon={<Folder className="h-4 w-4" />}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-start gap-2 xl:w-auto">
                <SearchFilterBarCompact
                  searchQuery={searchQuery}
                  onSearchChange={handleSearchChange}
                  filters={filters}
                  onFiltersChange={(newFilters: any) => search.setFilters(newFilters)}
                  sortBy={sortBy}
                  onSortChange={(newSort: string) => { setSortBy(newSort); setCurrentPage(1); }}
                  hideSearch
                  inline
                  showClearAllFilters={false}
                />

                {/* No "View" label: the two icons carry their own tooltips and
                    the picked one is already lit. */}
                <div className="flex h-10 items-center justify-center gap-1 rounded-lg bg-brand-blue/5 px-1.5 ring-1 ring-brand-blue/10">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`rounded p-2 transition-all ${
                      viewMode === 'list'
                        ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                    aria-label="List View" title="List View"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('card')}
                    className={`rounded p-2 transition-all ${
                      viewMode === 'card'
                        ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                    aria-label="Grid View" title="Grid View"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {viewMode === 'card' && gridToolbarFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500">Grid filters:</span>
                {gridToolbarFilterChips.map((chip) => (
                  <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-brand-blue/5 px-2 py-0.5 text-xs text-brand-blue ring-1 ring-brand-blue/20">
                    {chip.label}
                    <button
                      type="button"
                      onClick={chip.onClear}
                      className="rounded-full p-0.5 transition-colors hover:bg-brand-blue/10"
                      aria-label={`Clear ${chip.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search Results Summary */}
        {viewMode === 'list' && appliedSearchQuery && (
          <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">
                Found <span className="font-semibold">{totalItems}</span> matching resume{totalItems !== 1 ? 's' : ''}
                {appliedSearchQuery && (
                  <span> for "<span className="font-medium text-brand-blue">{appliedSearchQuery}</span>"</span>
                )}
              </span>
            </div>
            <button
              // One reset for the query and every filter — `onChange` returns
              // to page 1.
              onClick={search.reset}
              className="text-sm text-red-600 hover:text-red-700 hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {viewMode === 'list' ? (
          // List View with Folder Tree
          <div className="flex flex-col md:flex-row">
            <FolderTree
              folders={folders}
              selectedFolder={selectedFolder}
              onSelectFolder={(folderId: string) => { setSelectedFolder(folderId); setCurrentPage(1); }}
              onCreateFolder={canUploadMyResumes ? handleCreateFolder : undefined}
              onRenameFolder={canUpdateMyResumes ? handleRenameFolder : undefined}
              onDeleteFolder={canDeleteMyResumes ? handleDeleteFolder : undefined}
              onUploadToFolder={(folderId) => {
                if (!canUploadMyResumes) return;
                setSelectedFolder(folderId);
                openUploadToFolder(folderId);
              }}
              onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
              selectedResumes={selectedResumes}
              resumes={resumes}
              width={folderTreeWidth}
              onWidthChange={setFolderTreeWidth}
              collapsible
            />

            <div className="flex-1 flex flex-col min-w-0">
              {/* Breadcrumb Navigation for List View */}
              {selectedFolder && selectedFolder !== 'all' && (
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm">
                  <button
                    onClick={() => setSelectedFolder('all')}
                    className="flex items-center gap-1 text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>All Resumes</span>
                  </button>
                  {buildBreadcrumbPath(selectedFolder).map((item, index, arr) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      {index === arr.length - 1 ? (
                        <span className="text-gray-900 font-medium">{item.name}</span>
                      ) : (
                        <button
                          onClick={() => setSelectedFolder(item.id)}
                          className="text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                        >
                          {item.name}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination overlay for lighter page transitions */}
              <div className="relative">
                {isPaginating && (
                  <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                  </div>
                )}
                <ResumeTable
                  resumes={filteredResumes}
                  selectedResumes={selectedResumes}
                  onSelectResume={handleSelectResume}
                  onSelectAll={handleSelectAll}
                  onQuickView={(resume) => setQuickViewResume(resume)}
                  onApplyToJob={(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:score'))) ? handleSingleResumeApplyToJob : undefined}
                  onApplyToJobDisabled={isPlanLocked('resume_scoring')}
                  onApplyToJobDisabledReason={PLAN_LOCKED_MESSAGE}
                  onDelete={canDeleteMyResumes ? (id) => handleDelete(id) : undefined}
                  onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
                  folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
                  onViewDetails={(resume) => {
                    sessionStorage.setItem('resumeNavList', JSON.stringify(filteredResumes.map((r) => r.id)));
                    sessionStorage.setItem('resumeNavSource', 'my-resumes');
                    router.push(`/recruitment/resume-view/${resume.id}`);
                  }}
                  highlightQuery={appliedSearchQuery}
                  /* Rows can be dragged into an order of your own, kept per
                     folder — the grip still drops onto a folder to move a
                     resume, and now drops onto a row to place it. */
                  enableRowReorder
                  reorderScopeKey={selectedFolder || 'all'}
                  onArchive={canArchiveMyResumes ? (resumeId) => handleArchiveResumes([resumeId]) : undefined}
                  onUnarchive={canArchiveMyResumes ? (resumeId) => handleUnarchiveResumes([resumeId]) : undefined}
                  canShare={canShareMyResumes}
                  disablePagination={true}
                  isArchivedFolder={
                    folders.some(f => f.name === 'Archived Resumes' && !f.parentId && f.id === selectedFolder)
                  }
                  archivedFolderId={folders.find(f => f.name === 'Archived Resumes' && !f.parentId)?.id}
                  /* All Resumes aggregates every folder, so each row names the
                     one folder it actually lives in. Inside a folder the column
                     would repeat that folder on every row, so it is dropped. */
                  getFolderName={selectedFolder === 'all' ? getResumeFolderName : undefined}
                  showEmptyAction={false}
                  emptyState={
                    listControlsActive
                      ? undefined
                      : renderNoResumesEmptyState(selectedFolder === 'all' ? undefined : selectedFolder)
                  }
                />
              </div>
              {totalPages > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={(page) => { setCurrentPage(page); setIsPaginating(true); }}
                  onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); setIsPaginating(true); }}
                />
              )}
            </div>
          </div>
        ) : (
          // Card View - Folders as Cards with Breadcrumb Navigation
          <div className="p-3 sm:p-4 md:p-6" data-folder-card-boundary>
            {(() => {
              // Get current folder data and children
              const currentFolderData = cardViewFolder ? getFolderById(cardViewFolder) : null;
              const folderName = currentFolderData?.name || 'All Folders';
              const currentFolderDepth = cardViewFolder && cardViewFolder !== 'all' ? getFolderDepth(cardViewFolder) : 0;
              const currentFolderCanCreateSubfolder =
                cardViewFolder !== null &&
                cardViewFolder !== 'all' &&
                canCreateNestedFolder(cardViewFolder) &&
                !(currentFolderData?.name === 'Archived Resumes' && !currentFolderData?.parentId);

              // Get folders to display (top-level or children of current folder)
              const foldersToDisplay = cardViewFolder === null
                ? folders.filter(f => f.id !== 'all' && !f.parentId) // Top-level folders
                : cardViewFolder === 'all'
                  ? [] // No subfolders in All Resumes view
                  : currentFolderData?.children || []; // Children of current folder

              // Get resumes for current folder (only direct resumes, not nested)
              const folderResumes = cardViewFolder === null
                ? [] // No resumes at root level view
                : cardViewFolder === 'all'
                  ? filteredResumes // Show all resumes
                  : filteredResumes.filter(r => r.folderId === cardViewFolder);

              // Group resumes by folder for counts (only needed at root level)
              const resumesByFolder = new Map<string, Resume[]>();
              if (cardViewFolder === null) {
                filteredResumes.forEach(resume => {
                  if (resume.folderId) {
                    const existing = resumesByFolder.get(resume.folderId) || [];
                    resumesByFolder.set(resume.folderId, [...existing, resume]);
                  }
                });
              }

              // The fixtures, split out of the folder list so the root view can
              // lead with them — same grouping the list view's folder tree uses.
              // Root belongs to this group by placement only: its card is drawn
              // like any other folder's (see renderFolderCard).
              const isSystemFolder = (f: FolderType) =>
                !f.parentId && (f.name.toLowerCase() === 'root' || f.name === 'Archived Resumes');
              const systemRank = (f: FolderType) => (f.name.toLowerCase() === 'root' ? 0 : 1);
              const systemFolders = foldersToDisplay
                .filter(isSystemFolder)
                .sort((a, b) => systemRank(a) - systemRank(b));
              const myFolders = foldersToDisplay.filter(f => !isSystemFolder(f));
              const folderSearchTerm = searchQuery.trim().toLowerCase();
              const folderControlsActive = !!folderSearchTerm || cardFolderFilter !== 'all';

              const folderMatchesGridControls = (folder: FolderType) => {
                const matchesSearch = !folderSearchTerm || folder.name.toLowerCase().includes(folderSearchTerm);
                if (!matchesSearch) return false;

                const folderResumeCount = folder.count || 0;
                const folderSubfolderCount = folder.children?.length || 0;
                switch (cardFolderFilter) {
                  case 'with-resumes':
                    return folderResumeCount > 0;
                  case 'empty':
                    return folderResumeCount === 0 && folderSubfolderCount === 0;
                  case 'with-subfolders':
                    return folderSubfolderCount > 0;
                  default:
                    return true;
                }
              };

              const allResumesCardFolder: FolderType = { id: 'all', name: 'All Resumes', count: totalItems };
              const showAllResumesCard = cardViewFolder === null && folderMatchesGridControls(allResumesCardFolder);
              const visibleSystemFolders = systemFolders.filter(folderMatchesGridControls);
              const visibleMyFolders = myFolders.filter(folderMatchesGridControls);
              const visibleFoldersToDisplay = foldersToDisplay.filter(folderMatchesGridControls);
              const hasCurrentSubfolders = foldersToDisplay.length > 0;
              const hasVisibleRootFolders = showAllResumesCard || visibleSystemFolders.length > 0 || visibleMyFolders.length > 0;
              const showRootFolderNoMatches =
                cardViewFolder === null &&
                foldersToDisplay.length > 0 &&
                folderControlsActive &&
                !hasVisibleRootFolders;

              const visibleFolderResumes = folderResumes;
              const resumeControlsActive = !!searchQuery.trim() || activeResumeFilterCount > 0;
              /* `stretch` is for the fixtures row only, where the three cards
                 must match height. The user's own folder grids must NOT use it:
                 those cells grow when a card expands its subfolder list or
                 opens the inline name input, and a stretched row would drag
                 every neighbour to that height. */
              const renderFolderCard = (folder: FolderType, stretch = false) => {
                const isArchivedFolder = folder.name === 'Archived Resumes' && !folder.parentId;
                const isRootFolder = folder.name.toLowerCase() === 'root' && !folder.parentId;
                const isSystemCard = isArchivedFolder || isRootFolder;

                return (
                  <div key={folder.id} className={`space-y-2 ${stretch ? 'h-full' : ''}`}>
                    <DroppableFolderCard
                      folder={folder}
                      // Use folder.count from the API (total) rather than recounting
                      // the current page of resumes.
                      resumeCount={folder.count || 0}
                      hasSubfolders={(folder.children && folder.children.length > 0) || false}
                      isArchived={isArchivedFolder}
                      isRoot={isRootFolder}
                      // Root and Archived Resumes offer nothing renameable or
                      // deletable, so their cards drop the hover "+".
                      hideActions={isSystemCard}
                      stretch={stretch}
                      canUpload={canUploadMyResumes}
                      canCreateSubfolder={canUploadMyResumes && canCreateNestedFolder(folder.id)}
                      canRename={canUpdateMyResumes && !isSystemCard}
                      canDelete={canDeleteMyResumes && !isSystemCard}
                      onNavigate={navigateToFolder}
                      onMoveToFolder={handleMoveToFolder}
                      onUploadToFolder={openUploadToFolder}
                      onCreateSubfolder={openCardFolderInput}
                      onStartRename={openCardFolderRename}
                      onDeleteFolder={handleDeleteFolder}
                    />

                    {cardFolderParentId === folder.id && canCreateNestedFolder(folder.id) && (
                      <CardFolderNameInput
                        value={cardNewFolderName}
                        onChange={setCardNewFolderName}
                        onSubmit={submitCardFolder}
                        onCancel={closeCardFolderInput}
                        placeholder="Sub-folder name..."
                      />
                    )}

                    {cardRenamingFolderId === folder.id && (
                      <CardFolderNameInput
                        value={cardRenameValue}
                        onChange={setCardRenameValue}
                        onSubmit={() => submitCardFolderRename(folder.id)}
                        onCancel={closeCardFolderRename}
                        placeholder="Folder name..."
                        submitLabel="Save"
                      />
                    )}
                  </div>
                );
              };

              // Count resumes in a folder (including nested subfolders)
              const getResumeCountRecursive = (folder: FolderType): number => {
                let count = filteredResumes.filter(r => r.folderId === folder.id).length;
                if (folder.children) {
                  folder.children.forEach(child => {
                    count += getResumeCountRecursive(child);
                  });
                }
                return count;
              };

              return (
                <>
                  {/* Breadcrumb Navigation */}
                  {(cardViewFolder !== null || breadcrumbPath.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-4 sm:mb-6 text-xs sm:text-sm">
                      <button
                        onClick={() => navigateToFolder(null)}
                        className="flex items-center gap-1 text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                      >
                        <LayoutGrid className="w-4 h-4" />
                        <span>All Folders</span>
                      </button>
                      {breadcrumbPath.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                          {index === breadcrumbPath.length - 1 ? (
                            <span className="text-gray-900 font-medium">{item.name}</span>
                          ) : (
                            <button
                              onClick={() => navigateToFolder(item.id)}
                              className="text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                            >
                              {item.name}
                            </button>
                          )}
                        </div>
                      ))}
                      {cardViewFolder === 'all' && (
                        <>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-900 font-medium">All Resumes</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Current Folder Header (when inside a folder) */}
                  {cardViewFolder !== null && cardViewFolder !== 'all' && currentFolderData && (
                    <div className="relative mb-4 sm:mb-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ${
                        currentFolderData.name === 'Archived Resumes' && !currentFolderData.parentId
                          ? 'bg-amber-100 ring-amber-200/60'
                          : currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                            ? 'bg-brand-cyan/10 ring-brand-cyan/15'
                            : 'bg-brand-orange/10 ring-brand-orange/15'
                      }`}>
                        {currentFolderData.name === 'Archived Resumes' && !currentFolderData.parentId ? (
                          <Archive className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
                        ) : (
                          <FolderOpen className={`w-5 h-5 sm:w-6 sm:h-6 ${
                            currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                              ? 'text-brand-cyan'
                              : 'text-brand-orange'
                          }`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-gray-900 text-base sm:text-lg truncate">
                          {currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                            ? 'Root (Default)'
                            : currentFolderData.name}
                        </h2>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {foldersToDisplay.length > 0 && `${foldersToDisplay.length} subfolder${foldersToDisplay.length !== 1 ? 's' : ''}`}
                          {foldersToDisplay.length > 0 && visibleFolderResumes.length > 0 && ' • '}
                          {visibleFolderResumes.length > 0 && `${visibleFolderResumes.length} resume${visibleFolderResumes.length !== 1 ? 's' : ''}`}
                          {foldersToDisplay.length === 0 && visibleFolderResumes.length === 0 && !resumeControlsActive && 'Empty folder'}
                          {folderResumes.length > 0 && visibleFolderResumes.length === 0 && resumeControlsActive && 'No matching resumes'}
                        </p>
                      </div>
                        </div>
                        {canUploadMyResumes && currentFolderCanCreateSubfolder ? (
                          <button
                            type="button"
                            onClick={() => openCardFolderInput(cardViewFolder)}
                            className="inline-flex items-center justify-center gap-1 rounded-md border border-brand-blue/20 bg-white px-3 py-2 text-sm text-blue-600 shadow-sm shadow-brand-blue/5 transition-colors hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-blue-700 sm:self-start"
                          >
                            <Plus className="w-4 h-4" />
                            New Subfolder
                          </button>
                        ) : currentFolderDepth >= MAX_FOLDER_DEPTH ? (
                          <span className="text-xs sm:text-sm text-gray-500 sm:self-start">
                            Maximum depth reached ({MAX_FOLDER_DEPTH} levels)
                          </span>
                        ) : null}
                      </div>

                      {cardFolderParentId === cardViewFolder && currentFolderCanCreateSubfolder && (
                        <CardFolderNameInput
                          value={cardNewFolderName}
                          onChange={setCardNewFolderName}
                          onSubmit={submitCardFolder}
                          onCancel={closeCardFolderInput}
                          placeholder="Sub-folder name..."
                          inline
                        />
                      )}
                    </div>
                  )}

                  {/* All Resumes Header */}
                  {cardViewFolder === 'all' && (
                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                        <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-gray-900 text-base sm:text-lg">All Resumes</h2>
                        <p className="text-xs sm:text-sm text-gray-500">{visibleFolderResumes.length} resume{visibleFolderResumes.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  )}

                  {/* Folder grids. At root level the three fixtures lead in
                      their own titled row, then the user's own folders below —
                      matching how the list view's tree is grouped. Inside a
                      folder it stays a single "Subfolders" grid. */}
                  {/* Rendered whenever there is folder context to show. At max
                      depth, the create control is replaced by a status note. */}
                  {(cardViewFolder !== 'all' || foldersToDisplay.length > 0) && (
                    <div className="mb-4 sm:mb-6">
                      {cardViewFolder === null ? (
                        showRootFolderNoMatches ? (
                          <div className="text-center py-12 bg-white border-2 border-dashed border-brand-blue/20 rounded-xl">
                            <div className="w-16 h-16 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                              <Folder className="w-8 h-8 text-brand-blue" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">No folders match</h3>
                            <p className="text-gray-500">No folders match the current search or filter.</p>
                          </div>
                        ) : (
                          <>
                          {(showAllResumesCard || visibleSystemFolders.length > 0) && (
                            <>
                              {/* Same treatment as the list view's folder panel:
                                  inherited 16px / normal weight, gray-900. */}
                              <h3 className="text-gray-900 mb-2 sm:mb-3">System Folders</h3>
                              {/* Three across from sm up, so All Resumes, root and
                                  Archived Resumes sit on one row. `items-stretch`
                                  + `h-full` gives the three the same height; the
                                  All Resumes card mirrors the folder cards' own
                                  markup (p-3, 36px icon tile, text-sm title) so
                                  they match to the pixel rather than roughly. */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6 items-stretch">
                                {showAllResumesCard && (
                                  <div
                                    className="h-full bg-white border border-brand-blue/20 ring-1 ring-black/[0.02] rounded-xl shadow-sm shadow-brand-blue/5 overflow-hidden cursor-pointer hover:shadow-md hover:shadow-brand-blue/10 hover:border-brand-blue/40 hover:-translate-y-0.5 transition-all duration-150"
                                    onClick={() => {
                                      setCardViewFolder('all');
                                      setBreadcrumbPath([]);
                                    }}
                                  >
                                    <div className="flex h-full items-center gap-3 p-3">
                                      <div className="w-9 h-9 bg-[var(--raw-155dfc)]/10 ring-1 ring-[var(--raw-155dfc)]/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <LayoutGrid className="w-4 h-4 text-[var(--raw-155dfc)]" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-sm text-gray-900 truncate">All Resumes</h3>
                                        <p className="text-xs text-gray-500">{totalItems} resume{totalItems !== 1 ? 's' : ''}</p>
                                      </div>
                                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    </div>
                                  </div>
                                )}

                                {/* Wrapped, not passed by reference: `.map`
                                    would hand the array index in as `stretch`. */}
                                {visibleSystemFolders.map(folder => renderFolderCard(folder, true))}
                              </div>
                            </>
                          )}

                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                            <h3 className="text-gray-900">My Folders</h3>
                            <button
                              type="button"
                              onClick={() => {
                                if (!canUploadMyResumes) {
                                  toast.error('You do not have permission to upload resumes');
                                  return;
                                }
                                openCardFolderInput(null);
                              }}
                              aria-disabled={!canUploadMyResumes}
                              title={!canUploadMyResumes ? 'You do not have permission to upload resumes' : undefined}
                              className={`text-sm flex items-center gap-1 ${
                                canUploadMyResumes
                                  ? 'text-blue-600 hover:text-blue-700 cursor-pointer'
                                  : 'text-gray-400 cursor-not-allowed opacity-60'
                              }`}
                            >
                              <Plus className="w-4 h-4" />
                              New Folder
                            </button>
                          </div>

                          {cardFolderParentId === null && (
                            <CardFolderNameInput
                              value={cardNewFolderName}
                              onChange={setCardNewFolderName}
                              onSubmit={submitCardFolder}
                              onCancel={closeCardFolderInput}
                              placeholder="Folder name..."
                            />
                          )}

                          {visibleMyFolders.length > 0 ? (
                            // `items-start` so a card that expands its subfolder
                            // list grows on its own instead of stretching every
                            // other card in the row to match — grid items default
                            // to filling the row height, which left the
                            // neighbours padded with blank space.
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 items-start">
                              {visibleMyFolders.map(folder => renderFolderCard(folder))}
                            </div>
                          ) : myFolders.length > 0 && folderControlsActive ? (
                            <p className="text-xs sm:text-sm text-gray-500">No folders match the current search or filter.</p>
                          ) : systemFolders.length > 0 ? (
                            // Skipped when there are no folders at all — the
                            // page-level empty state below covers that case.
                            <p className="text-xs sm:text-sm text-gray-500">No folders yet. Create one to organize your resumes.</p>
                          ) : null}
                          </>
                        )
                      ) : (
                        <>
                          {hasCurrentSubfolders && (
                            <div className="flex items-center mb-2 sm:mb-3">
                              <h3 className="text-xs sm:text-sm font-medium text-gray-700">Subfolders</h3>
                            </div>
                          )}

                          {cardViewFolder !== 'all' && currentFolderDepth >= MAX_FOLDER_DEPTH && (
                            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs sm:text-sm text-amber-800">
                              This child subfolder is the deepest allowed level.
                            </div>
                          )}

                          {visibleFoldersToDisplay.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 items-start">
                              {visibleFoldersToDisplay.map(folder => renderFolderCard(folder))}
                            </div>
                          )}
                          {foldersToDisplay.length > 0 && visibleFoldersToDisplay.length === 0 && folderControlsActive && (
                            <p className="mt-3 text-xs sm:text-sm text-gray-500">No subfolders match the current search or filter.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Loading state at root level (folders/resumes not yet fetched).
                      Skeleton mirrors the folder-card grid below: same grid
                      classes, six cards each shaped like DroppableFolderCard
                      (icon box + name line + count line + action dot). */}
                  {loading && cardViewFolder === null && foldersToDisplay.length === 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 items-start">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="bg-white border border-gray-100 rounded-xl shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]"
                        >
                          <div className="flex items-center gap-3 p-3">
                            <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
                            <div className="flex-1 min-w-0 space-y-2">
                              <Skeleton className="h-4 w-2/3" />
                              <Skeleton className="h-3 w-1/3" />
                            </div>
                            <Skeleton className="h-7 w-7 rounded-md flex-shrink-0" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state for root level */}
                  {!loading && cardViewFolder === null && foldersToDisplay.length === 0 && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                        <Folder className="w-8 h-8 text-brand-blue" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">No folders found</h3>
                      <p className="text-gray-500">Create folders to organize your resumes</p>
                    </div>
                  )}

                  {/* Resumes Section (when inside a folder) */}
                  {cardViewFolder !== null && (
                    <>
                      {visibleFolderResumes.length > 0 && (
                        <div>
                          {foldersToDisplay.length > 0 && (
                            <h3 className="text-sm font-medium text-gray-700 mb-3">Resumes in this folder</h3>
                          )}
                          {/* The list view's table, not a copy of it: one
                              component means the two views cannot drift, and a
                              folder, a subfolder and a child subfolder all get
                              the same rows, pinned columns, sticky header,
                              actions and reordering.

                              The card that frames it is this view's own — the
                              list view sits inside the folder-tree panel and
                              borrows its border, but here the table stands on
                              the page beside the folder cards and needs one. */}
                          {/* gray-200, not gray-100: the table's own rules are
                              gray-200, so a lighter frame read as three sides
                              and a missing bottom — the top and flanks were the
                              table's separators showing through, not the card. */}
                          <div className="bg-white border border-gray-200 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl overflow-hidden">
                          <ResumeTable
                            resumes={visibleFolderResumes}
                            selectedResumes={selectedResumes}
                            onSelectResume={handleSelectResume}
                            onSelectAll={(selected) => {
                              // Scoped to this folder's rows, not the whole list.
                              if (selected) {
                                setSelectedResumes(prev => [...new Set([...prev, ...visibleFolderResumes.map(r => r.id)])]);
                              } else {
                                setSelectedResumes(prev => prev.filter(id => !visibleFolderResumes.some(r => r.id === id)));
                              }
                            }}
                            onQuickView={(resume) => setQuickViewResume(resume)}
                            onApplyToJob={(isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:score'))) ? handleSingleResumeApplyToJob : undefined}
                            onApplyToJobDisabled={isPlanLocked('resume_scoring')}
                            onApplyToJobDisabledReason={PLAN_LOCKED_MESSAGE}
                            onDelete={canDeleteMyResumes ? (id) => handleDelete(id) : undefined}
                            onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
                            folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
                            onViewDetails={(resume) => {
                              sessionStorage.setItem('resumeNavList', JSON.stringify(visibleFolderResumes.map((x) => x.id)));
                              sessionStorage.setItem('resumeNavSource', 'my-resumes');
                              router.push(`/recruitment/resume-view/${resume.id}`);
                            }}
                            highlightQuery={appliedSearchQuery}
                            enableRowReorder
                            reorderScopeKey={cardViewFolder || 'all'}
                            onArchive={canArchiveMyResumes ? (resumeId) => handleArchiveResumes([resumeId]) : undefined}
                            onUnarchive={canArchiveMyResumes ? (resumeId) => handleUnarchiveResumes([resumeId]) : undefined}
                            canShare={canShareMyResumes}
                            disablePagination={true}
                            isArchivedFolder={
                              folders.some(f => f.name === 'Archived Resumes' && !f.parentId && f.id === cardViewFolder)
                            }
                            archivedFolderId={folders.find(f => f.name === 'Archived Resumes' && !f.parentId)?.id}
                            /* All Resumes aggregates every folder, so each row
                               names the one it lives in. */
                            getFolderName={cardViewFolder === 'all' ? getResumeFolderName : undefined}
                            showEmptyAction={false}
                          />
                          </div>
                        </div>
                      )}

                      {/* Loading state while the folder's resumes are being
                          fetched. Skeleton mirrors the ResumeTable that renders
                          here once loaded, framed by the same white card. */}
                      {loading && visibleFolderResumes.length === 0 && visibleFoldersToDisplay.length === 0 && (
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <ResumeTableSkeleton rows={8} />
                        </div>
                      )}

                      {/* Empty state when no resumes and no subfolders. Same
                          illustrated state the list view shows, so the two views
                          of an empty folder read identically — and its button
                          uploads straight into the folder being viewed. */}
                      {!loading && visibleFolderResumes.length === 0 && visibleFoldersToDisplay.length === 0 && !resumeControlsActive && !folderControlsActive && (
                        <div className="bg-white border-2 border-dashed border-brand-blue/20 rounded-xl">
                          {renderNoResumesEmptyState(cardViewFolder === 'all' ? undefined : cardViewFolder ?? undefined)}
                        </div>
                      )}

                      {/* Card view pagination */}
                      {!loading && visibleFolderResumes.length === 0 && (folderResumes.length > 0 || resumeControlsActive) && (
                        <div className="text-center py-12 bg-white border-2 border-dashed border-brand-blue/20 rounded-xl">
                          <div className="w-16 h-16 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                            <FileText className="w-8 h-8 text-brand-blue" />
                          </div>
                          <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">No resumes match</h3>
                          <p className="text-gray-500">Clear search or filters to show more resumes.</p>
                        </div>
                      )}

                      {totalPages > 0 && folderResumes.length > 0 && (
                        <div className="mt-4">
                          <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            onPageChange={(page) => { setCurrentPage(page); setIsPaginating(true); }}
                            onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); setIsPaginating(true); }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {isUploadModalOpen && (
        <UploadModal
          folders={folders.filter(f => f.id !== 'all' && !(f.name === 'Archived Resumes' && !f.parentId))}
          tenant={null}
          // Pre-select whichever folder the user is currently browsing.
          // Card view uses `cardViewFolder` (drill-down navigation), list view
          // uses `selectedFolder`. Skip the synthetic 'all' value — it's a
          // filter, not a real folder the API knows about. When no folder is
          // selected, the backend routes the upload to the user's root folder.
          targetFolder={(() => {
            if (uploadTargetFolderId) return uploadTargetFolderId;
            const card = cardViewFolder && cardViewFolder !== 'all'
              ? cardViewFolder
              : null;
            const list = selectedFolder && selectedFolder !== 'all' ? selectedFolder : null;
            return card || list || undefined;
          })()}
          onClose={() => {
            setIsUploadModalOpen(false);
            setUploadTargetFolderId(undefined);
          }}
          onUpload={handleUploadResumes}
          onCreateFolder={handleCreateFolder}
          onViewResume={(resumeId) => {
            setIsUploadModalOpen(false);
            sessionStorage.setItem('resumeNavSource', 'my-resumes');
            router.push(`/recruitment/resume-view/${resumeId}`);
          }}
          onDuplicateDetected={(duplicateData) => {
            // Set duplicate files for the DuplicateResumeModal
            setDuplicateFiles([{
              file: duplicateData.file,
              existingResume: duplicateData.existingResume,
              contentDifferences: duplicateData.contentDifferences || [],
              isDuplicate: duplicateData.isDuplicate,
            }]);
            setPendingUploadFolderId(duplicateData.targetFolderId);
            setPendingUploadFolderLabel(duplicateData.targetFolderPath);
            setIsUploadModalOpen(false);
            setIsDuplicateModalOpen(true);
          }}
        />
      )}

      {/* The eye in the Actions column reads the resume in the same document
          preview the version lists use, so viewing a resume looks the same
          wherever it is opened from. */}

      {quickViewResume && (
        <ResumeTextPreviewModal
          resumeId={quickViewResume.id}
          title={quickViewResume.name}
          subtitle={quickViewResume.fileName}
          onClose={() => setQuickViewResume(null)}
        />
      )}

      {/* Duplicate Resume Modal */}
      {isDuplicateModalOpen && duplicateFiles.length > 0 && (
        <DuplicateResumeModal
          duplicates={duplicateFiles}
          onClose={() => {
            setIsDuplicateModalOpen(false);
            setDuplicateFiles([]);
            setPendingUploadFolderId(undefined);
            setPendingUploadFolderLabel(undefined);
          }}
          onResolve={handleResolveDuplicates}
          targetFolderPath={pendingUploadFolderPath}
        />
      )}

      {/* Apply to Job Modal */}
      {isApplyToJobModalOpen && (
        <ApplyToJobModal
          resumes={
            singleResumeToApply
              ? [singleResumeToApply]
              : uploadedResumeToScore
                ? resumes.filter(r => r.id === uploadedResumeToScore.id)
                : resumes.filter(r => selectedResumes.includes(r.id))
          }
          jobs={publishedJobs}
          onClose={() => {
            setIsApplyToJobModalOpen(false);
            setUploadedResumeToScore(null);
            setSingleResumeToApply(null);
          }}
          onApply={handleApplyToJobSubmit}
        />
      )}

      {/* Duplicate Scoring Warning Modal */}
      {duplicateScoringWarning.isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200" />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center gap-4 p-6 border-b border-gray-200">
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Already Scored - Duplicate Warning</h3>
                  <p className="text-sm text-gray-500">{duplicateScoringWarning.jobTitle}</p>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <p className="text-gray-700 mb-4">
                  <span className="font-semibold text-red-600">{duplicateScoringWarning.existingScores.length} candidate(s)</span> have already been scored for this job description.
                </p>

                {/* List of duplicate candidates */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    Already Scored - Will NOT be Re-scored:
                  </h4>
                  <div className="space-y-2">
                    {duplicateScoringWarning.existingScores.map((score, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                            <X className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{score.candidate_name}</div>
                            {score.scored_at && (
                              <div className="text-xs text-gray-500">
                                Scored on {formatDateTimeIST(score.scored_at)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">{formatOverallScore(score.overall_rating_10, score.overall_score)}</div>
                          <div className="text-xs text-gray-500 capitalize">{score.match_status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {duplicateScoringWarning.newCount > 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold text-green-700">{duplicateScoringWarning.newCount} new candidate(s)</span> will be scored if you continue.
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">
                      All selected candidates are already scored. No new candidates to score.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-xl border-t border-gray-200">
                <button
                  onClick={() => setDuplicateScoringWarning({ isOpen: false, jobId: '', jobTitle: '', resumeIds: [], existingScores: [], newCount: 0 })}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                {duplicateScoringWarning.newCount > 0 && (
                  <button
                    onClick={handleScoreOnlyNew}
                    className="flex items-center gap-2 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Score Only New ({duplicateScoringWarning.newCount})
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ZIP Download Confirmation Modal */}
      {isZipDownloadModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
            onClick={() => !isDownloadingZip && setIsZipDownloadModalOpen(false)}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-blue/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <FileArchive className="w-7 h-7 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Download as ZIP</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Multiple files selected</p>
                  </div>
                </div>
                <button
                  onClick={() => !isDownloadingZip && setIsZipDownloadModalOpen(false)}
                  disabled={isDownloadingZip}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 flex items-center gap-4 border-b border-gray-200">
                <div className="w-16 h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-7 h-7 text-brand-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-blue">
                    {selectedResumes.length}
                    <span className="text-base font-semibold text-gray-900 ml-2">candidates selected</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    All selected resumes will be downloaded and packed in a ZIP file.
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center gap-3 px-6 py-4">
                <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-brand-blue" />
                </div>
                <p className="text-sm text-gray-700">
                  Do you want to download all selected resumes as a ZIP file?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                <button
                  onClick={handleZipDownload}
                  disabled={isDownloadingZip}
                  className="flex items-center gap-2 px-5 py-2.5 text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloadingZip ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Continue
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Archive Resumes Confirmation Modal */}
      {isArchiveModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
            onClick={() => !isArchivingResumes && setIsArchiveModalOpen(false)}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Archive className="w-7 h-7 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Archive Resumes</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Move selected resumes to archive</p>
                  </div>
                </div>
                <button
                  onClick={() => !isArchivingResumes && setIsArchiveModalOpen(false)}
                  disabled={isArchivingResumes}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 flex items-center gap-4 border-b border-gray-200">
                <div className="w-16 h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-7 h-7 text-brand-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-blue">
                    {selectedResumes.length}
                    <span className="text-base font-semibold text-gray-900 ml-2">candidates selected</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    The selected resumes will be moved to archive and hidden from the active list.
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center gap-3 px-6 py-4">
                <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-brand-blue" />
                </div>
                <p className="text-sm text-gray-700">
                  Are you sure you want to archive all selected resumes?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                <button
                  onClick={handleConfirmBulkArchive}
                  disabled={isArchivingResumes}
                  className="flex items-center gap-2 px-5 py-2.5 text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isArchivingResumes ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Archiving...
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4" />
                      Archive
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Upload History Sheet (Slide-in Panel) */}
      {/* Minimized Upload History Floating Indicator */}
      {isUploadHistoryMinimized && (
        <div
          onClick={() => {
            setIsUploadHistoryMinimized(false);
            setIsUploadHistoryModalOpen(true);
          }}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 bg-brand-blue hover:bg-brand-blue-2 text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-all cursor-pointer flex items-center gap-2 sm:gap-3 animate-in slide-in-from-bottom duration-300"
        >
          <div className="relative">
            <History className="w-5 h-5" />
            {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-orange rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">Upload History</p>
            <p className="text-xs text-blue-100">
              {(() => {
                const processing = uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length;
                return processing > 0 ? `${processing} processing...` : 'Click to expand';
              })()}
            </p>
          </div>
          <Maximize2 className="w-4 h-4 ml-2" />
        </div>
      )}

      {isUploadHistoryModalOpen && !isUploadHistoryMinimized && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-300"
            onClick={() => {
              setIsUploadHistoryMinimized(true);
              setIsUploadHistoryModalOpen(false);
            }}
          />
          {/* Centered Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-4xl max-h-[85dvh] flex flex-col animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="bg-gradient-to-r from-brand-blue/[0.06] via-brand-cyan/[0.04] to-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-xl font-semibold text-gray-900 tracking-tight">Upload History</h2>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5">View all past bulk upload reports</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setIsUploadHistoryMinimized(true);
                        setIsUploadHistoryModalOpen(false);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-xl font-medium"
                      aria-label="Minimize" title="Minimize"
                    >
                      −
                    </button>
                    <button
                      onClick={handleCloseUploadHistory}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-slate-50">
                {(() => {
                  const myResumesHistory = uploadHistory.filter(r => r.source === 'my-resumes');
                  const isActive = (r: any) => r.status === 'processing' || r.pending > 0;
                  const activeRecords = myResumesHistory.filter(isActive);
                  const completedRecords = myResumesHistory.filter(r => !isActive(r));

                  // Stats are scoped to the records in the active tab — when a
                  // batch finishes its numbers move from Currently Processing
                  // into Completed automatically.
                  const displayRecords = uploadHistoryTab === 'current' ? activeRecords : completedRecords;
                  const completedCount = displayRecords.reduce((sum, r) => sum + (r.completed || 0), 0);
                  const duplicatedCount = displayRecords.reduce((sum, r) => sum + (r.duplicated || 0), 0);
                  const versionedCount = displayRecords.reduce((sum, r) => sum + (r.versioned || 0), 0);
                  const failedCount = displayRecords.reduce((sum, r) => sum + (r.errors || 0), 0);
                  const pendingCount = displayRecords.reduce((sum, r) => sum + (r.pending || 0), 0);
                  // Fall back to the item list for batches whose row predates the `cancelled` column.
                  const cancelledTotal = displayRecords.reduce((sum, r) => sum + Math.max(
                    r.cancelled || 0,
                    r.statuses?.filter((s: any) => s.status === 'cancelled' || s.status === 'discarded').length || 0,
                  ), 0);
                  const totalFiles = displayRecords.reduce((sum, r) => sum + (r.totalFiles || 0), 0);
                  // Cancelled files were never attempted, so they must not count against
                  // the success rate — that is what turned a cancelled batch into "23%".
                  const attemptedFiles = Math.max(0, totalFiles - cancelledTotal);
                  const successRate = attemptedFiles > 0 ? Math.round((completedCount / attemptedFiles) * 100) : 0;

                  /* A tab holding no batches at all gets one illustrated empty
                     state and nothing else. Previously it stacked three blocks
                     that each said the same thing — the all-zero stats card, the
                     "0 batches" list header, and the list's own placeholder. */
                  const showFullEmptyState = displayRecords.length === 0;

                  return (
                    <>
                      {/* Tabs */}
                      <div className="inline-flex items-center bg-white border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-1 mb-4 sm:mb-6 shadow-sm shadow-brand-blue/5">
                        <button
                          onClick={() => setUploadHistoryTab('current')}
                          className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
                            uploadHistoryTab === 'current'
                              ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeRecords.length > 0 && uploadHistoryTab !== 'current' ? 'text-brand-blue animate-spin' : ''}`} />
                          Currently Processing
                          {activeRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-2xs sm:text-xs font-semibold ${
                              uploadHistoryTab === 'current' ? 'bg-white text-brand-blue' : 'bg-brand-blue/10 text-brand-blue'
                            }`}>
                              {activeRecords.length}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setUploadHistoryTab('completed')}
                          className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
                            uploadHistoryTab === 'completed'
                              ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Completed
                          {completedRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-2xs sm:text-xs font-semibold ${
                              uploadHistoryTab === 'completed' ? 'bg-white text-brand-blue' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {completedRecords.length}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* 7-card stats grid — same layout in both tabs, scoped to
                          the tab's records. Brand palette throughout, except the
                          neutral Cancelled card. When
                          every number is zero the grid is replaced by a single
                          "nothing here" card, so a wall of zeros never shows.
                          Skipped entirely when the tab has no batches — the
                          illustrated empty state below speaks for it. */}
                      {!showFullEmptyState && (() => {
                        const statCards = [
                          { key: 'completed', label: 'Completed', value: completedCount, icon: CheckCircle, tone: 'brand-blue' },
                          { key: 'duplicated', label: 'Duplicates', value: duplicatedCount, icon: Copy, tone: 'brand-orange' },
                          { key: 'versioned', label: 'Versioned', value: versionedCount, icon: GitBranch, tone: 'brand-blue-2' },
                          { key: 'error', label: 'Failed', value: failedCount, icon: AlertCircle, tone: 'brand-orange-deep' },
                          { key: 'pending', label: 'Pending', value: pendingCount, icon: Clock, tone: 'brand-teal' },
                          { key: 'cancelled', label: 'Cancelled', value: cancelledTotal, icon: Ban, tone: 'gray' },
                        ] as const;

                        // Tailwind needs whole class names, so map tone → classes.
                        const TONE_CLASS: Record<string, { card: string; active: string; idle: string; tile: string; value: string }> = {
                          'brand-blue': {
                            card: 'from-brand-blue/[0.08] to-brand-blue/[0.03]',
                            active: 'border-brand-blue/50 ring-2 ring-brand-blue/30 shadow-md',
                            idle: 'border-brand-blue/20',
                            tile: 'bg-brand-blue',
                            value: 'text-brand-blue',
                          },
                          'brand-blue-2': {
                            card: 'from-brand-blue-2/[0.08] to-brand-blue-2/[0.03]',
                            active: 'border-brand-blue-2/50 ring-2 ring-brand-blue-2/30 shadow-md',
                            idle: 'border-brand-blue-2/20',
                            tile: 'bg-brand-blue-2',
                            value: 'text-brand-blue-2',
                          },
                          'brand-cyan': {
                            card: 'from-brand-cyan/[0.08] to-brand-cyan/[0.03]',
                            active: 'border-brand-cyan/50 ring-2 ring-brand-cyan/30 shadow-md',
                            idle: 'border-brand-cyan/20',
                            tile: 'bg-brand-cyan',
                            value: 'text-brand-cyan',
                          },
                          'brand-teal': {
                            card: 'from-brand-teal/[0.08] to-brand-teal/[0.03]',
                            active: 'border-brand-teal/50 ring-2 ring-brand-teal/30 shadow-md',
                            idle: 'border-brand-teal/20',
                            tile: 'bg-brand-teal',
                            value: 'text-brand-teal',
                          },
                          'brand-orange': {
                            card: 'from-brand-orange/[0.08] to-brand-orange/[0.03]',
                            active: 'border-brand-orange/50 ring-2 ring-brand-orange/30 shadow-md',
                            idle: 'border-brand-orange/20',
                            tile: 'bg-brand-orange',
                            value: 'text-brand-orange-deep',
                          },
                          'brand-orange-deep': {
                            card: 'from-brand-orange-deep/[0.08] to-brand-orange-deep/[0.03]',
                            active: 'border-brand-orange-deep/50 ring-2 ring-brand-orange-deep/30 shadow-md',
                            idle: 'border-brand-orange-deep/20',
                            tile: 'bg-brand-orange-deep',
                            value: 'text-brand-orange-deep',
                          },
                          // Cancelled is deliberately off-palette: it's an
                          // absence of work, not a result.
                          'gray': {
                            card: 'from-gray-100 to-gray-200/50',
                            active: 'border-gray-700 ring-2 ring-gray-400 shadow-md',
                            idle: 'border-gray-300',
                            tile: 'bg-gray-600',
                            value: 'text-gray-800',
                          },
                        };

                        const allZero = statCards.every(card => (card.value || 0) === 0) && totalFiles === 0;

                        if (allZero) {
                          return (
                            <div className="flex items-center gap-3 mb-4 sm:mb-6 bg-gradient-to-br from-brand-blue/[0.08] to-brand-blue/[0.03] border border-brand-blue/20 rounded-xl p-4">
                              <div className="w-9 h-9 bg-brand-blue rounded-lg flex items-center justify-center flex-shrink-0">
                                <Clock className="w-4 h-4 text-white" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">
                                  {uploadHistoryTab === 'current' ? 'No uploads in progress' : 'No completed uploads yet'}
                                </p>
                                <p className="text-xs text-gray-600">
                                  {uploadHistoryTab === 'current'
                                    ? 'Upload resumes to see live progress and status counts here.'
                                    : 'Finished upload batches and their status counts will appear here.'}
                                </p>
                              </div>
                            </div>
                          );
                        }

                        // Only outcomes that actually happened get a card — a
                        // batch with no duplicates or failures shouldn't spend
                        // grid space saying so. The active filter's card stays
                        // even at zero, otherwise clicking a card could make it
                        // vanish with the filter still applied and no way to
                        // toggle it back off.
                        const visibleCards = statCards.filter(
                          card => (card.value || 0) > 0 || uploadHistoryFilter === card.key
                        );

                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
                            {visibleCards.map(({ key, label, value, icon: Icon, tone }) => {
                              const t = TONE_CLASS[tone];
                              const isActive = uploadHistoryFilter === key;
                              return (
                                <div
                                  key={key}
                                  onClick={() => setUploadHistoryFilter(isActive ? null : key)}
                                  className={`bg-gradient-to-br ${t.card} border rounded-xl p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${isActive ? t.active : t.idle}`}
                                >
                                  <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                                    <div className={`w-6 h-6 sm:w-8 sm:h-8 ${t.tile} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                                    </div>
                                    <span className="text-2xs sm:text-xs text-gray-700 truncate">{label}</span>
                                  </div>
                                  <div className={`text-lg sm:text-xl lg:text-2xl font-bold tracking-tight ${t.value}`}>{value}</div>
                                </div>
                              );
                            })}

                            {/* Success Rate — not a filter, so it stays static.
                                Hidden when nothing was attempted: 0% would read
                                as a total failure rather than "no data". */}
                            {attemptedFiles > 0 && (
                            <div className="bg-gradient-to-br from-brand-cyan/[0.08] to-brand-cyan/[0.03] border border-brand-cyan/20 rounded-xl p-2.5 sm:p-3 lg:p-4">
                              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-brand-cyan rounded-lg flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                                </div>
                                <span className="text-2xs sm:text-xs text-gray-700 truncate">Success Rate</span>
                              </div>
                              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-brand-cyan tracking-tight">{successRate}%</div>
                            </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Active Filter Indicator */}
                      {uploadHistoryFilter && (
                        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                          <span className="text-xs text-gray-500">Filtering by:</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            uploadHistoryFilter === 'completed' ? 'bg-brand-blue/10 text-brand-blue' :
                            uploadHistoryFilter === 'duplicated' ? 'bg-brand-orange/15 text-brand-orange-deep' :
                            uploadHistoryFilter === 'versioned' ? 'bg-brand-blue-2/10 text-brand-blue-2' :
                            uploadHistoryFilter === 'error' ? 'bg-brand-orange-deep/10 text-brand-orange-deep' :
                            uploadHistoryFilter === 'cancelled' ? 'bg-gray-200 text-gray-800' :
                            'bg-brand-teal/10 text-brand-teal'
                          }`}>
                            {uploadHistoryFilter === 'completed' ? 'Completed' :
                             uploadHistoryFilter === 'duplicated' ? 'Duplicates' :
                             uploadHistoryFilter === 'versioned' ? 'Versioned' :
                             uploadHistoryFilter === 'error' ? 'Failed' :
                             uploadHistoryFilter === 'cancelled' ? 'Cancelled' :
                             'Pending'}
                          </span>
                          <button
                            onClick={() => setUploadHistoryFilter(null)}
                            className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
                           aria-label="Close">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Overall ETA Banner — only relevant on the Currently Processing tab */}
                      {uploadHistoryTab === 'current' && (() => {
                        // Only show for batches that still have genuinely active items
                        const activeBatches = myResumesHistory.filter(r =>
                          r.pending > 0 && r.date &&
                          r.statuses?.some((s: any) => s.status === 'pending' || s.status === 'processing')
                        );
                        if (activeBatches.length === 0) return null;
                        const totalPending = activeBatches.reduce((sum: number, r: any) => sum + r.pending, 0);
                        const totalProcessed = activeBatches.reduce((sum: number, r: any) => sum + r.completed + r.errors + r.duplicated + (r.versioned || 0), 0);
                        if (totalProcessed <= 0) {
                          return (
                            <div className="flex items-center gap-2 mb-3 sm:mb-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-brand-blue/10 border border-brand-blue/20 rounded-xl animate-pulse">
                              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue animate-spin flex-shrink-0" />
                              <span className="text-xs sm:text-sm text-brand-blue">Processing {totalPending} resume{totalPending !== 1 ? 's' : ''}... Estimating time remaining</span>
                            </div>
                          );
                        }
                        // Cap elapsed at 10 minutes so a batch that started hours ago with a
                        // stuck file doesn't produce an absurd ETA (e.g. "233–433 mins remaining").
                        const earliestStart = Math.min(...activeBatches.map((r: any) => new Date(r.date).getTime()));
                        const elapsed = Math.min(Date.now() - earliestStart, 10 * 60 * 1000);
                        const avgTimePerFile = elapsed / totalProcessed;
                        const remainingMs = totalPending * avgTimePerFile;
                        const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
                        const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
                        const etaText = lowMins === highMins
                          ? `Approx. ${lowMins} min${lowMins !== 1 ? 's' : ''} remaining`
                          : `Approx. ${lowMins}\u2013${highMins} mins remaining`;
                        return (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 mb-3 sm:mb-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-brand-blue/10 border border-brand-blue/20 rounded-xl">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0" />
                              <span className="text-xs sm:text-sm font-medium text-brand-blue">{etaText}</span>
                            </div>
                            <span className="text-2xs sm:text-xs text-brand-blue/60 sm:ml-auto">{totalPending} resume{totalPending !== 1 ? 's' : ''} left across {activeBatches.length} batch{activeBatches.length !== 1 ? 'es' : ''}</span>
                          </div>
                        );
                      })()}

                      {/* Upload History List */}
                      {!showFullEmptyState && (
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {uploadHistoryTab === 'current' ? 'Active Uploads' : 'Recent Uploads'}
                          </h3>
                          <span className="text-xs text-gray-500">{displayRecords.length} batch{displayRecords.length !== 1 ? 'es' : ''}</span>
                        </div>
                      )}

                      {showFullEmptyState ? (
                        <>
                          <UploadHistoryEmptyState
                            title={
                              uploadHistoryTab === 'current'
                                ? 'No uploads in progress'
                                : myResumesHistory.length === 0 ? 'No upload history yet' : 'Nothing here yet'
                            }
                            lines={
                              uploadHistoryTab === 'current'
                                ? ['All your uploads are processed.', 'Start a new bulk upload to see live progress here.']
                                : myResumesHistory.length === 0
                                  ? ['Bulk upload reports will appear here.', 'Upload multiple resumes to see detailed status reports.']
                                  : ['Your uploads are still running.', 'Their reports will appear here once they finish.']
                            }
                            /* Straight from history into the upload dialog — the
                               modal has to close first or the two would stack. */
                            onAction={
                              canUploadMyResumes
                                ? () => {
                                    handleCloseUploadHistory();
                                    openUploadToFolder(undefined);
                                  }
                                : undefined
                            }
                          />

                          <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15">
                              <Lightbulb className="h-4 w-4 text-brand-blue" />
                            </span>
                            <span className="min-w-0 text-xs text-gray-700 sm:text-sm">
                              Tip: You can upload a single resume or bulk upload multiple resumes at once.
                            </span>
                            <Link
                              href="/help"
                              onClick={handleCloseUploadHistory}
                              className="ml-auto flex-shrink-0 text-xs font-medium text-brand-blue transition-colors hover:text-brand-blue-2 hover:underline sm:text-sm"
                            >
                              Learn more
                            </Link>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-4">
                          {displayRecords
                            .slice(0, 20)
                            .map(record => {
                              // Prefer the server counter, but fall back to the item list so an
                              // older batch row (written before `cancelled` existed) still adds up.
                              const cancelledFromItems = record.statuses?.filter(
                                (s: any) => s.status === 'cancelled' || s.status === 'discarded'
                              ).length ?? 0;
                              const cancelledCount = Math.max(record.cancelled ?? 0, cancelledFromItems);
                              const processed = record.completed + record.errors + record.duplicated + (record.versioned || 0) + cancelledCount;
                              // Files the batch counters can't explain. If this is ever non-zero the
                              // summary is under-reporting, and we say so instead of hiding it.
                              const unaccountedCount = Math.max(0, (record.totalFiles || 0) - processed - (record.pending || 0));
                              // Success is measured against files that were actually attempted —
                              // cancelling 77 of 100 is not a 23% failure of the upload.
                              const attempted = Math.max(0, (record.totalFiles || 0) - cancelledCount);
                              const percentage = attempted > 0 ? Math.round((record.completed / attempted) * 100) : 100;
                              const isUploading = record.status === 'uploading';
                              const isProcessing = record.status === 'processing' || record.pending > 0;
                              const isCancelled = cancelledCount > 0;
                              // Optimistic pre-API record: its id and item ids are `temp-*`
                              // placeholders, not UUIDs. Every retry/cancel endpoint takes UUID
                              // path params, so any action fired against it 422s on uuid_parsing.
                              // `local-*` records are the client-side stand-ins for single
                              // uploads the server gave us no batch for — same story, no UUID.
                              const isTempRecord = record.id.startsWith('temp-') || record.id.startsWith('local-');
                              const hasErrors = record.errors > 0;
                              const hasIssues = record.duplicated > 0 || (record.versioned || 0) > 0 || record.errors > 0 || cancelledCount > 0;

                              return (
                                <div
                                  key={record.id}
                                  className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-4 lg:p-5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                                >
                                  {/* Header Row */}
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 sm:mb-4 gap-2 sm:gap-3">
                                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                                      </div>
                                      <div className="min-w-0">
                                        <span className="font-medium text-gray-900 text-xs sm:text-sm block truncate">{record.fileName}</span>
                                        {record.date && (
                                          <span className="text-2xs sm:text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                            <Calendar className="w-3 h-3 flex-shrink-0" />
                                            <span className="truncate">Started {formatDateTimeIST(record.date)}</span>
                                          </span>
                                        )}
                                        {record.completedAt && record.pending === 0 && (() => {
                                          const start = new Date(record.date).getTime();
                                          const end = new Date(record.completedAt).getTime();
                                          const ms = Math.max(0, end - start);
                                          const totalSec = Math.round(ms / 1000);
                                          const h = Math.floor(totalSec / 3600);
                                          const m = Math.floor((totalSec % 3600) / 60);
                                          const s = totalSec % 60;
                                          const duration = h > 0
                                            ? `${h}h ${m}m ${s}s`
                                            : m > 0
                                              ? `${m}m ${s}s`
                                              : `${s}s`;
                                          return (
                                            <span className="text-2xs sm:text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                              <CheckCircle className="w-3 h-3 flex-shrink-0 text-brand-blue" />
                                              <span className="truncate">
                                                Finished {formatDateTimeIST(record.completedAt)}
                                                <span className="ml-1.5 text-gray-400">·</span>
                                                <span className="ml-1.5 text-gray-700 font-medium">{duration}</span>
                                              </span>
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 sm:gap-3 ml-10 sm:ml-0">
                                      {isUploading && (
                                        <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-brand-blue/10 text-brand-blue text-2xs sm:text-xs rounded-full border border-brand-blue/20 animate-pulse">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Uploading...
                                        </span>
                                      )}
                                      {!isUploading && hasIssues && (
                                        <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-brand-orange/15 text-brand-orange-deep text-2xs sm:text-xs rounded-full border border-brand-orange/30">
                                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                          <span className="hidden sm:inline">Needs Review</span>
                                          <span className="sm:hidden">Review</span>
                                        </span>
                                      )}
                                      {!isUploading && (
                                        <div className="text-right">
                                          <div className={`text-base sm:text-xl font-bold tracking-tight ${
                                            percentage === 100 ? 'text-brand-blue' :
                                            percentage >= 90 ? 'text-brand-cyan' :
                                            percentage >= 70 ? 'text-brand-orange' :
                                            'text-brand-orange-deep'
                                          }`}>
                                            {percentage}%
                                          </div>
                                          <div className="text-2xs sm:text-xs text-gray-500">Success</div>
                                        </div>
                                      )}
                                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                                    </div>
                                  </div>

                                  {/* Mini Stats */}
                                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                                    {/* Mini stats use the same brand tones as the summary cards above */}
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-blue/[0.06] rounded-lg border border-brand-blue/15">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-blue">{record.completed}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Done</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-orange/[0.08] rounded-lg border border-brand-orange/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-orange-deep">{record.duplicated}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Duplicates</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-blue-2/[0.07] rounded-lg border border-brand-blue-2/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-blue-2">{record.versioned || 0}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Version</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-orange-deep/[0.08] rounded-lg border border-brand-orange-deep/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-orange-deep">{record.errors}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Failed</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-teal/[0.08] rounded-lg border border-brand-teal/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-teal">{record.pending}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Pending</div>
                                    </div>
                                    {/* Cancelled — previously had no tile, so cancelled files simply
                                        disappeared from the batch summary (23 of 100, nothing failed). */}
                                    <div className="text-center p-1.5 sm:p-2 bg-gray-100 rounded-lg border border-gray-300">
                                      <div className="text-xs sm:text-sm font-semibold text-gray-700">{cancelledCount}</div>
                                      <div className="text-2xs sm:text-xs text-gray-600">Cancelled</div>
                                    </div>
                                  </div>
                                  {unaccountedCount > 0 && (
                                    <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-2xs sm:text-xs text-amber-800">
                                      <AlertCircle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                                      <span>
                                        {unaccountedCount} file{unaccountedCount !== 1 ? 's' : ''} in this batch {unaccountedCount !== 1 ? 'are' : 'is'} not
                                        reflected in the totals above — open the file list below for their actual state.
                                      </span>
                                    </div>
                                  )}

                                  {/* Progress Bar */}
                                  <div className="mb-3 sm:mb-4">
                                    <div className="flex items-center justify-between text-2xs sm:text-xs text-gray-600 mb-1 sm:mb-1.5">
                                      <span>Progress</span>
                                      <span>{processed} of {record.totalFiles}</span>
                                    </div>
                                    <div className="h-1.5 sm:h-2 bg-brand-blue/10 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full transition-all ${
                                          percentage === 100 ? 'bg-brand-blue' :
                                          percentage >= 90 ? 'bg-brand-cyan' :
                                          percentage >= 70 ? 'bg-brand-orange' :
                                          'bg-brand-orange-deep'
                                        }`}
                                        style={{ width: `${Math.min((processed / record.totalFiles) * 100, 100)}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* Estimated Time Remaining — only show when items are genuinely active */}
                                  {record.pending > 0 && record.date &&
                                   record.statuses?.some((s: any) => s.status === 'pending' || s.status === 'processing') &&
                                   (() => {
                                    // Cap elapsed at 10 minutes to prevent absurd ETAs when a file
                                    // is stuck at 'processing' and the batch started hours ago.
                                    const elapsed = Math.min(Date.now() - new Date(record.date).getTime(), 10 * 60 * 1000);
                                    if (processed <= 0 || elapsed <= 0) {
                                      return (
                                        <div className="flex items-center gap-1.5 mb-3 sm:mb-4 text-2xs sm:text-xs text-blue-600">
                                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                                          <span>Estimating time remaining...</span>
                                        </div>
                                      );
                                    }
                                    const avgTimePerFile = elapsed / processed;
                                    const remainingMs = record.pending * avgTimePerFile;
                                    const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
                                    const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
                                    const etaText = lowMins === highMins
                                      ? `Approx. ${lowMins} min${lowMins !== 1 ? 's' : ''} remaining`
                                      : `Approx. ${lowMins}\u2013${highMins} mins remaining`;
                                    return (
                                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-0.5 sm:gap-1.5 mb-3 sm:mb-4 text-2xs sm:text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2.5 sm:px-3 py-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                                          <span>{etaText}</span>
                                        </div>
                                        <span className="text-blue-400 sm:ml-auto">{record.pending} file{record.pending !== 1 ? 's' : ''} left</span>
                                      </div>
                                    );
                                  })()}

                                  {/* Retry / Cancel Batch actions — hidden until the optimistic
                                      temp record is swapped for the real server batch_id, since
                                      both endpoints require a UUID path param. */}
                                  {(isProcessing || hasErrors || isCancelled) && !isTempRecord && (
                                    <div className="flex items-center gap-2 mb-3 sm:mb-4" onClick={e => e.stopPropagation()}>
                                      {/* Retry — stuck in pending, failed, or cancelled (re-queues the files) */}
                                      {(isProcessing || hasErrors || isCancelled) && (
                                        <button
                                          disabled={retryingBatches.has(record.id)}
                                          onClick={(e) => handleRetryBatch(record.id, e)}
                                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                            retryingBatches.has(record.id)
                                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                              : 'bg-brand-blue/10 text-brand-blue border-brand-blue/20 hover:bg-brand-blue/15'
                                          }`}
                                        >
                                          <RefreshCw className={`w-3 h-3 ${retryingBatches.has(record.id) ? 'animate-spin' : ''}`} />
                                          {retryingBatches.has(record.id)
                                            ? 'Retrying...'
                                            : isCancelled && !isProcessing ? `Re-queue ${cancelledCount} cancelled` : 'Retry'}
                                        </button>
                                      )}
                                      {/* Cancel — show only while items are still pending.
                                          type="button" so a stray Enter can't submit-activate it, and it
                                          opens a confirmation instead of cancelling on the spot. */}
                                      {isProcessing && record.pending > 0 && (
                                        <button
                                          type="button"
                                          disabled={cancellingBatches.has(record.id)}
                                          onClick={(e) => handleCancelBatch(record.id, record.pending, e)}
                                          onKeyDown={(e) => {
                                            // Space scrolls the file list; don't let it double as "cancel 77 files".
                                            if (e.key === ' ') e.preventDefault();
                                          }}
                                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                            cancellingBatches.has(record.id)
                                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                              : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                          }`}
                                        >
                                          <X className="w-3 h-3" />
                                          {cancellingBatches.has(record.id) ? 'Cancelling...' : `Cancel Batch (${record.pending} pending)`}
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Individual File Statuses */}
                                  {record.statuses && record.statuses.length > 0 && (() => {
                                    const filteredStatuses = uploadHistoryFilter
                                      ? record.statuses.filter((f: any) => {
                                          if (uploadHistoryFilter === 'completed') return f.status === 'completed';
                                          if (uploadHistoryFilter === 'duplicated') return f.status === 'duplicate' || f.status === 'duplicated';
                                          if (uploadHistoryFilter === 'versioned') return f.status === 'versioned' || f.status === 'version';
                                          if (uploadHistoryFilter === 'error') return f.status === 'error';
                                          if (uploadHistoryFilter === 'pending') return f.status === 'pending' || f.status === 'processing';
                                          if (uploadHistoryFilter === 'cancelled') return f.status === 'cancelled' || f.status === 'discarded';
                                          return true;
                                        })
                                      : record.statuses;
                                    return filteredStatuses.length > 0 ? (
                                    <div className="border-t border-gray-100 pt-4">
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                          <div className="text-xs font-semibold text-gray-700">
                                            Files ({filteredStatuses.length}{uploadHistoryFilter ? ` of ${record.statuses.length}` : ''})
                                          </div>
                                          {/* Select All checkbox for versioned items */}
                                          {uploadHistoryFilter === 'versioned' && filteredStatuses.length > 0 && (() => {
                                            const versionedInBatch = filteredStatuses.filter((f: any) => f.status === 'versioned' || f.status === 'version');
                                            if (versionedInBatch.length === 0) return null;
                                            const allSelected = versionedInBatch.every((f: any) => selectedVersionedItems.has(f.id));
                                            return (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const newSelected = new Map(selectedVersionedItems);
                                                  if (allSelected) {
                                                    versionedInBatch.forEach((f: any) => newSelected.delete(f.id));
                                                  } else {
                                                    versionedInBatch.forEach((f: any) => {
                                                      newSelected.set(f.id, {
                                                        id: f.id,
                                                        fileName: f.fileName,
                                                        candidateName: f.candidateName || '',
                                                        resumeId: f.resumeId,
                                                      });
                                                    });
                                                  }
                                                  setSelectedVersionedItems(newSelected);
                                                }}
                                                className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-brand-blue-2 bg-brand-blue-2/10 border border-brand-blue-2/20 rounded-md hover:bg-brand-blue-2/15 transition-colors"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={allSelected}
                                                  readOnly
                                                  className="w-3 h-3 rounded border-brand-blue-2/40 text-brand-blue-2 pointer-events-none"
                                                />
                                                Select All
                                              </button>
                                            );
                                          })()}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="flex items-center gap-1 text-green-600">
                                            <CheckCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'completed' || f.status === 'versioned').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-blue-600">
                                            <Loader2 className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'processing' || f.status === 'pending').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-red-600">
                                            <AlertCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'error' || f.status === 'duplicate' || f.status === 'duplicated').length}
                                          </span>
                                          {/* Cancelled files had no counter at all, so they were invisible here too */}
                                          {record.statuses.some((f: any) => f.status === 'cancelled' || f.status === 'discarded') && (
                                            <span className="flex items-center gap-1 text-gray-600">
                                              <Ban className="w-3 h-3" />
                                              {record.statuses.filter((f: any) => f.status === 'cancelled' || f.status === 'discarded').length}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {/* Short note: cancel only for queued items */}
                                      {record.statuses.some((f: any) => f.status === 'pending' || f.status === 'error' || f.status === 'cancelled') && (
                                        <p className="text-2xs text-gray-400 mb-2">
                                          ℹ️ Retry is available for queued, failed &amp; cancelled files. Cancel is only available for queued files.
                                        </p>
                                      )}
                                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                        {filteredStatuses.map((file: any, idx: number) => {
                                          const isClickable = ['completed', 'versioned', 'duplicate', 'error'].includes(file.status);
                                          const isVersioned = file.status === 'versioned' || file.status === 'version';
                                          const isSelected = selectedVersionedItems.has(file.id);
                                          const isCancelledFile = file.status === 'cancelled' || file.status === 'discarded';
                                          // Anything the UI has no case for. Surfaced explicitly rather than
                                          // being absorbed by the "Queued" fallback, so a new backend status
                                          // can never masquerade as "still waiting in the queue".
                                          const isUnknownStatusFile = ![
                                            'completed', 'versioned', 'version', 'processing',
                                            'pending', 'duplicate', 'duplicated', 'error',
                                            'cancelled', 'discarded',
                                          ].includes(file.status);
                                          return (
                                          <div
                                            key={file.id || idx}
                                            onClick={() => {
                                              if (isVersioned) {
                                                // Open resolution modal for this single versioned file
                                                setSelectedVersionedItems(new Map([[file.id, {
                                                  id: file.id,
                                                  fileName: file.fileName,
                                                  candidateName: file.candidateName || '',
                                                  resumeId: file.resumeId,
                                                }]]));
                                                setIsBulkResolveModalOpen(true);
                                              } else if (isClickable) {
                                                setSelectedHistoryItem({
                                                  id: file.id,
                                                  fileName: file.fileName,
                                                  status: file.status,
                                                  errorMessage: file.errorMessage,
                                                  candidateName: file.candidateName,
                                                  resumeId: file.resumeId,
                                                });
                                              }
                                            }}
                                            className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg border transition-all ${
                                              isVersioned && isSelected ? 'bg-brand-blue-2/15 border-brand-blue-2/40 ring-1 ring-brand-blue-2/30' :
                                              file.status === 'completed' ? 'bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-300' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2/[0.07] border-brand-blue-2/20 hover:bg-brand-blue-2/[0.12] hover:border-brand-blue-2/30' :
                                              file.status === 'processing' ? 'bg-brand-blue/5 border-brand-blue/20' :
                                              file.status === 'duplicate' ? 'bg-brand-orange/[0.07] border-brand-orange/20 hover:bg-brand-orange/10 hover:border-brand-orange/30' :
                                              file.status === 'error' ? 'bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300' :
                                              isCancelledFile ? 'bg-gray-100 border-gray-300' :
                                              isUnknownStatusFile ? 'bg-amber-50 border-amber-300' :
                                              'bg-gray-50 border-gray-200'
                                            } ${isClickable ? 'cursor-pointer' : ''}`}
                                          >
                                            {/* Checkbox for versioned items */}
                                            {isVersioned && (
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  const newSelected = new Map(selectedVersionedItems);
                                                  if (isSelected) {
                                                    newSelected.delete(file.id);
                                                  } else {
                                                    newSelected.set(file.id, {
                                                      id: file.id,
                                                      fileName: file.fileName,
                                                      candidateName: file.candidateName || '',
                                                      resumeId: file.resumeId,
                                                    });
                                                  }
                                                  setSelectedVersionedItems(newSelected);
                                                }}
                                                className="w-4 h-4 rounded border-brand-blue-2/40 text-brand-blue-2 focus:ring-brand-blue-2/40 cursor-pointer flex-shrink-0"
                                              />
                                            )}
                                            {/* Status Icon */}
                                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                              file.status === 'completed' ? 'bg-green-500' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2' :
                                              file.status === 'processing' ? 'bg-brand-blue' :
                                              file.status === 'duplicate' ? 'bg-brand-orange' :
                                              file.status === 'error' ? 'bg-red-500' :
                                              isCancelledFile ? 'bg-gray-500' :
                                              'bg-gray-400'
                                            }`}>
                                              {file.status === 'completed' && <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'versioned' && <GitBranch className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'processing' && <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 text-white animate-spin" />}
                                              {file.status === 'duplicate' && <Copy className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'error' && <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'pending' && <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-white animate-pulse" />}
                                              {isCancelledFile && <Ban className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                            </div>
                                            {/* File Info */}
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-gray-900 text-2xs sm:text-sm truncate">{file.fileName}</div>
                                              <div className="text-2xs sm:text-xs text-gray-500 mt-0.5 truncate">
                                                {file.status === 'completed' && (file.candidateName ? `✓ ${file.candidateName}` : '✓ Uploaded successfully')}
                                                {file.status === 'versioned' && (file.candidateName ? `↑ ${file.candidateName} - Version update detected` : '↑ Version update detected - Pending resolution')}
                                                {file.status === 'processing' && '⚡ Processing...'}
                                                {file.status === 'pending' && '⏳ Waiting in queue...'}
                                                {file.status === 'duplicate' && (file.errorMessage || '⚠ Duplicate - already exists')}
                                                {file.status === 'error' && (file.errorMessage || '✗ Failed to process')}
                                                {isCancelledFile && (file.errorMessage || '✕ Cancelled before processing')}
                                                {isUnknownStatusFile && `? Unrecognised status: ${String(file.status)}`}
                                              </div>
                                            </div>
                                            {/* Status Badge */}
                                            <span className={`hidden sm:inline px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-2xs sm:text-xs font-semibold flex-shrink-0 ${
                                              file.status === 'completed' ? 'bg-green-100 text-green-700' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2/15 text-brand-blue-2' :
                                              file.status === 'processing' ? 'bg-brand-blue/10 text-brand-blue' :
                                              file.status === 'duplicate' ? 'bg-brand-orange/15 text-brand-orange-deep' :
                                              file.status === 'error' ? 'bg-red-100 text-red-700' :
                                              isCancelledFile ? 'bg-gray-200 text-gray-700' :
                                              'bg-gray-100 text-gray-600'
                                            }`}>
                                              {file.status === 'completed' ? '✓ Done' :
                                               file.status === 'versioned' ? '↑ Version' :
                                               file.status === 'processing' ? '⚡ Running' :
                                               file.status === 'duplicate' ? '⚠ Duplicate' :
                                               file.status === 'error' ? '✗ Failed' :
                                               file.status === 'cancelled' ? '✕ Cancelled' :
                                               file.status === 'discarded' ? '✕ Discarded' :
                                               file.status === 'pending' ? '⏳ Queued' :
                                               /* Never claim "Queued" for a status we don't understand —
                                                  that is exactly how 77 cancelled files read as queued. */
                                               `? ${String(file.status ?? 'unknown')}`}
                                            </span>
                                            {/* Per-item Retry / Cancel — same temp-record guard as the
                                                batch-level actions above. Without it the optimistic
                                                record renders these buttons over `temp-file-N` ids and
                                                the request 422s on uuid_parsing for both path params. */}
                                            {file.id && !isTempRecord && !String(file.id).startsWith('temp-')
                                              && (file.status === 'pending' || file.status === 'error' || file.status === 'cancelled') && (
                                              <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                                <button
                                                  disabled={retryingItems.has(file.id)}
                                                  onClick={(e) => handleRetryItem(record.id, file.id, e)}
                                                  className={`p-1 rounded text-2xs font-medium transition-colors ${retryingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-brand-blue hover:bg-brand-blue/10'}`}
                                                  aria-label="Retry this file" title={file.status === 'cancelled' ? 'Re-queue this cancelled file' : 'Retry this file'}
                                                >
                                                  <RefreshCw className={`w-3 h-3 ${retryingItems.has(file.id) ? 'animate-spin' : ''}`} />
                                                </button>
                                                {file.status === 'pending' && (
                                                  <button
                                                    disabled={cancellingItems.has(file.id)}
                                                    onClick={(e) => handleCancelItem(record.id, file.id, file.fileName, e)}
                                                    className={`p-1 rounded text-2xs font-medium transition-colors ${cancellingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-red-500 hover:bg-red-50'}`}
                                                    aria-label="Cancel this file (queued only)" title="Cancel this file (queued only)"
                                                  >
                                                    <X className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                        })}
                                      </div>
                                    </div>
                                    ) : uploadHistoryFilter ? (
                                      <div className="border-t border-gray-100 pt-4">
                                        <p className="text-xs text-gray-400 text-center py-3">No {
                                          uploadHistoryFilter === 'completed' ? 'completed' :
                                          uploadHistoryFilter === 'duplicated' ? 'duplicate' :
                                          uploadHistoryFilter === 'versioned' ? 'versioned' :
                                          uploadHistoryFilter === 'error' ? 'failed' :
                                          uploadHistoryFilter === 'cancelled' ? 'cancelled' :
                                          'pending'
                                        } files in this batch</p>
                                      </div>
                                    ) : null;
                                  })()}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Floating Resolve Selected Bar */}
              {selectedVersionedItems.size > 0 && (
                <div className="border-t border-brand-blue-2/20 px-3 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-brand-blue-2/[0.07] to-brand-blue/[0.04] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-brand-blue-2 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue-2/25 ring-1 ring-white/10">
                      <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-brand-blue-2">
                        {selectedVersionedItems.size} versioned resume{selectedVersionedItems.size !== 1 ? 's' : ''} selected
                      </span>
                      <p className="text-2xs sm:text-xs text-brand-blue-2/80">Choose how to resolve these version conflicts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedVersionedItems(new Map())}
                      className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => setIsBulkResolveModalOpen(true)}
                      className="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue-2/25 ring-1 ring-white/10 flex items-center justify-center gap-1.5 sm:gap-2"
                    >
                      <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Resolve ({selectedVersionedItems.size})
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Upload History Item Detail Modal */}
      {selectedHistoryItem && (
        <UploadHistoryDetailModal
          item={selectedHistoryItem}
          onClose={() => setSelectedHistoryItem(null)}
        />
      )}

      {/* Bulk Version Resolution Modal */}
      {isBulkResolveModalOpen && selectedVersionedItems.size > 0 && (
        <BulkVersionResolutionModal
          items={Array.from(selectedVersionedItems.values())}
          onClose={() => setIsBulkResolveModalOpen(false)}
          onResolved={() => {
            setIsBulkResolveModalOpen(false);
            setSelectedVersionedItems(new Map());
            // Refresh batch data, without pulling the view out of its folder
            fetchUploadHistory();
            isFetchingRef.current = false;
            fetchData(appliedSearchQuery, filters, selectedFolder, true);
            refreshAllResumesTotal();
          }}
        />
      )}

      {/* Assessment Modal - Select Assessment */}
      {isAssessmentModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 animate-in fade-in duration-200"
            onClick={() => {
              setIsAssessmentModalOpen(false);
              setAssessmentSearchQuery('');
              setSelectedAssessments([]);
              setExcludedInviteIds([]);
            }}
          />
          {/* Shell, header, body and footer are the Apply to Job / Score Resume
              dialog's, so the candidate actions all read as one dialog. */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                    <ClipboardList className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Invite to Assessment</h2>
                    {/* What the dialog is for. The count lives on the Candidates
                        Selected panel below, which tracks unticking. */}
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Select candidates to invite for an assessment</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setAssessmentSearchQuery('');
                    setSelectedAssessments([]);
                  }}
                  className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors flex-shrink-0"
                 aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
                {/* The same Candidates Selected panel the Score Resume and
                    Apply to Job dialogs use — full list, untick to drop
                    someone, resume version, and the eye to read a resume. */}
                <SelectedCandidatesPanel
                  resumes={resumes.filter(r => selectedResumes.includes(r.id))}
                  excludedIds={excludedInviteIds}
                  onToggleCandidate={(id) =>
                    setExcludedInviteIds(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
                    )
                  }
                  tip="Invitations go to each candidate's email address — untick anyone you want to leave out."
                />

                {/* Assessment Selection. Search first, then the list, in the
                    order and wording the job dialog uses. */}
                <div>
                  <div className="mb-4">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Search Assessments</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                      <input
                        type="text"
                        value={assessmentSearchQuery}
                        onChange={(e) => setAssessmentSearchQuery(e.target.value)}
                        placeholder="Search by assessment ID, name, JD ID or JD name..."
                        className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-3">
                    <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
                      Select an Active Assessment
                      {activeAssessments.length > 0 && (
                        <span className="ml-2 font-normal text-gray-500 dark:text-slate-400">
                          {activeAssessments.length} available
                        </span>
                      )}
                    </label>
                    {/* Same escape hatch the job list offers: the only way back
                        to "nothing picked" once the others have gone inert. */}
                    {selectedAssessments.length > 0 && (
                      <button
                        onClick={() => setSelectedAssessments([])}
                        className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>

                  {loadingAssessments ? (
                    <div className="flex items-center justify-center py-8 tf-loader-center tf-loader-center--compact">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : (() => {
                    // Filter assessments based on search query
                    const filteredAssessments = activeAssessments.filter(assessment => {
                      if (!assessmentSearchQuery.trim()) return true;
                      const query = assessmentSearchQuery.toLowerCase();
                      return (
                        assessment.short_id?.toLowerCase().includes(query) ||
                        assessment.title?.toLowerCase().includes(query) ||
                        assessment.jd_short_id?.toLowerCase().includes(query) ||
                        assessment.jd_title?.toLowerCase().includes(query)
                      );
                    });

                    return filteredAssessments.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>{assessmentSearchQuery ? 'No assessments match your search' : 'No active assessments found'}</p>
                        <p className="text-sm">{assessmentSearchQuery ? 'Try different search terms' : 'Create and publish an assessment first to send invitations'}</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {filteredAssessments.map(assessment => {
                          const isSelected = selectedAssessments.some(a => a.id === assessment.id);
                          /* Once one is picked the rest go inert, with the
                             reason on the row — the same treatment the job list
                             gives the roles you didn't choose. */
                          const blockedByOtherPick = selectedAssessments.length > 0 && !isSelected;
                          return (
                            <label
                              key={assessment.id}
                              title={blockedByOtherPick
                                ? 'Only one assessment can be sent at a time — clear the current selection to choose this one'
                                : undefined}
                              aria-disabled={blockedByOtherPick}
                              className={`block w-full text-left p-4 rounded-lg border-2 transition-all ${
                                blockedByOtherPick
                                  ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                                  : isSelected
                                    ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10 cursor-pointer'
                                    : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/5 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                {/* A radio, because exactly one assessment is sent. */}
                                <input
                                  type="radio"
                                  name="invite-to-assessment-selection"
                                  checked={isSelected}
                                  disabled={blockedByOtherPick}
                                  onChange={() => !blockedByOtherPick && toggleAssessmentSelection(assessment)}
                                  onClick={() => isSelected && toggleAssessmentSelection(assessment)}
                                  className="w-4 h-4 mt-1 flex-shrink-0 text-brand-blue border-gray-300 focus:ring-brand-blue/40 disabled:cursor-not-allowed"
                                />

                                <div className="flex-1">
                                  {/* Assessment ID, Title, Version */}
                                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    {/* Same ID chip the Assessments page uses. */}
                                    {assessment.short_id && (
                                      <span className="inline-flex items-center px-2.5 py-1 bg-brand-blue text-white rounded text-xs font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                                        {assessment.short_id}
                                      </span>
                                    )}
                                    {/* Title with the inline "- Version N" suffix stripped,
                                        so the version isn't rendered twice. */}
                                    <h5 className="font-medium text-gray-900">
                                      {parseAssessmentTitle(assessment.title || '').cleanTitle || 'Untitled assessment'}
                                    </h5>
                                    {/* The shared badge, rather than a chip of this
                                        screen's own — it falls back to the version in
                                        the title when the API omits the field. */}
                                    <VersionBadge
                                      version={typeof assessment.version === 'number' ? assessment.version : undefined}
                                      title={assessment.title}
                                      size="sm"
                                      variant="secondary"
                                    />
                                    {/* Status, worded and coloured as on the
                                        Assessments page: the API's "published"
                                        is shown there as a green "Active". */}
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 bg-green-100 text-green-700 ring-green-200">
                                      {assessment.status === 'published' ? 'Active' : assessment.status}
                                    </span>
                                    {/* Selected indicator, as on a picked job row */}
                                    {isSelected && (
                                      <CheckCircle className="w-5 h-5 text-brand-blue ml-auto flex-shrink-0" />
                                    )}
                                  </div>

                                  {/* Linked JD, written as the Assessments page writes it. */}
                                  {assessment.jd_short_id && (
                                    <div className="text-xs text-gray-700 font-medium mb-1.5">
                                      <span>{assessment.jd_short_id}</span>
                                      {assessment.jd_title && (
                                        <span className="ml-2">{assessment.jd_title}</span>
                                      )}
                                      {assessment.jd_version && (
                                        <span className="ml-1 text-gray-500">v{assessment.jd_version}</span>
                                      )}
                                    </div>
                                  )}

                                  {/* Duration and Sections */}
                                  <div className="flex items-center gap-3 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {assessment.duration_minutes || 0} min
                                    </span>
                                    <span>•</span>
                                    <span>{assessment.sections?.length || 0} section{assessment.sections?.length !== 1 ? 's' : ''}</span>
                                  </div>

                                  {/* Created By and Date */}
                                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1.5">
                                    {assessment.created_by_name && (
                                      <>
                                        <span>Created by: <span className="text-gray-700 font-medium">{assessment.created_by_name}</span></span>
                                        <span>•</span>
                                      </>
                                    )}
                                    {assessment.created_at && (
                                      <span>
                                        {formatIST(assessment.created_at)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                {/* Reads like the Score Resume footer: what is still missing,
                    and once nothing is, what is about to happen. */}
                {(() => {
                  const inviteeCount = selectedResumes.filter(id => !excludedInviteIds.includes(id)).length;
                  // One line, always: it sits beside the buttons, and a second
                  // line would push the footer taller.
                  return (
                    <div className="min-w-0 truncate whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                      {inviteeCount === 0
                        ? 'Select at least one candidate to continue'
                        : selectedAssessments.length === 0
                          ? 'Select one assessment to continue'
                          : (
                            <span className="inline-flex items-center gap-1.5 align-middle">
                              <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                              Ready to invite {inviteeCount} candidate{inviteeCount === 1 ? '' : 's'} to 1 assessment
                            </span>
                          )}
                    </div>
                  );
                })()}
                <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      if (selectedAssessments.length === 0) {
                        toast.error('Please select an assessment');
                        return;
                      }

                      // Prepare candidate data from the candidates still ticked
                      // in the panel above — unticking has to mean something.
                      const candidateData = resumes
                        .filter(r => selectedResumes.includes(r.id) && !excludedInviteIds.includes(r.id))
                        .map((r, index) => ({
                          id: `${Date.now()}-${index}`,
                          name: r.name,
                          email: r.email || '',
                          source: 'database' as const,
                          resumeId: r.id
                        }))
                        .filter(c => c.email); // Only include candidates with email

                      if (candidateData.length === 0) {
                        toast.error('Selected resumes must have email addresses');
                        return;
                      }

                      // Open ShareAssessmentModal for customization (works for both single and multiple)
                      setPrefilledCandidates(candidateData);
                      setIsAssessmentModalOpen(false);
                      setIsShareAssessmentModalOpen(true);
                    }}
                    /* Both halves have to be answered, as in the job dialog. */
                    disabled={
                      selectedAssessments.length === 0 ||
                      selectedResumes.filter(id => !excludedInviteIds.includes(id)).length === 0
                    }
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm whitespace-nowrap bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" />
                    Send Invitations
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* AI Interview invite — shared with the Internal Database page so both
          lists offer the identical action. */}
      <InviteToAIInterviewFlow
        open={isAIInterviewPickerOpen}
        onClose={() => setIsAIInterviewPickerOpen(false)}
        candidates={resumes
          .filter((r) => selectedResumes.includes(r.id))
          .map((r) => ({ id: r.id, name: r.name, email: r.email }))}
        /* The full rows too, so the dialog can show the shared Candidates
           Selected panel rather than a bare count. */
        resumes={resumes.filter((r) => selectedResumes.includes(r.id)) as any}
        onInvited={() => setSelectedResumes([])}
      />

      {/* Share Assessment Modal with Pre-filled Candidates — one assessment,
          the one picked in the invite dialog. */}
      {isShareAssessmentModalOpen && selectedAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={isShareAssessmentModalOpen}
          onClose={() => {
            setIsShareAssessmentModalOpen(false);
            setSelectedAssessments([]);
            setPrefilledCandidates([]);
            setSelectedResumes([]);
            setAssessmentSearchQuery('');
          }}
          assessment={{
            id: selectedAssessments[0].id,
            title: selectedAssessments[0].title,
            duration: `${selectedAssessments[0].duration_minutes || 0} min`,
            questions: selectedAssessments[0].sections?.reduce((total: number, section: any) =>
              total + (section.questions?.length || 0), 0) || 0,
            type: selectedAssessments[0].sections?.length > 0 && selectedAssessments[0].sections[0]?.section_type === 'ai_generated'
              ? 'AI-Generated'
              : 'Manual',
            short_id: selectedAssessments[0].short_id,
            jd_short_id: selectedAssessments[0].jd_short_id,
            jd_title: selectedAssessments[0].jd_title,
            jd_version: selectedAssessments[0].jd_version
          }}
          prefilledCandidates={prefilledCandidates}
          inviteSource="My Resumes"
        />
      )}

      {/* AI Talent Match Modal */}
      {isAITalentMatchModalOpen && (
        <AITalentMatchSelectJobModal
          resumes={resumes.filter(r => selectedResumes.includes(r.id))}
          jobs={publishedJobs}
          onClose={() => setIsAITalentMatchModalOpen(false)}
          onMatch={(resumeIds, jobId) => {
            // Store selected resumes in sessionStorage for the AI Talent Match page
            const resumeData = resumes
              .filter(r => resumeIds.includes(r.id))
              .map(r => ({
                id: r.id,
                candidateName: r.name,
                email: r.email,
              }));
            sessionStorage.setItem('aiTalentMatchResumes', JSON.stringify(resumeData));

            // Close modal
            setIsAITalentMatchModalOpen(false);
            setSelectedResumes([]);

            // Navigate to AI Talent Match page with the selected JD
            router.push(`/recruitment/ai-talent-match?jdId=${jobId}&view=new`);
          }}
        />
      )}

      {/* Cancel Batch Confirmation Dialog */}
      <AlertDialog
        open={cancelBatchConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setCancelBatchConfirm({ isOpen: false, batchId: '', pendingCount: 0 });
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setCancelBatchConfirm({ isOpen: false, batchId: '', pendingCount: 0 })}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Ban className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                  Cancel {cancelBatchConfirm.pendingCount} queued file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''}?
                </AlertDialogTitle>
                <p className="mt-1 text-sm text-gray-500">
                  This stops {cancelBatchConfirm.pendingCount} file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''} that
                  {cancelBatchConfirm.pendingCount !== 1 ? ' have' : ' has'} not finished processing.
                </p>
              </div>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-1.5 rounded-xl border border-red-100 bg-red-50/60 p-4 text-sm text-gray-800">
                <p>Files already completed are kept</p>
                <p>Their Resume Storage units are refunded</p>
                <p>You can re-queue cancelled files later with Retry</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
            <AlertDialogCancel>Keep processing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelBatch}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel {cancelBatchConfirm.pendingCount} file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Single File Confirmation Dialog */}
      <AlertDialog
        open={cancelItemConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setCancelItemConfirm({ isOpen: false, batchId: '', itemId: '', fileName: '' });
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setCancelItemConfirm({ isOpen: false, batchId: '', itemId: '', fileName: '' })}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Ban className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                  Cancel this file?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <p className="mt-1 text-sm text-gray-500">
                    <span className="font-medium text-gray-900">{cancelItemConfirm.fileName}</span> will not
                    be processed. Its unit is refunded and you can re-queue it later with Retry.
                  </p>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
            <AlertDialogCancel>Keep processing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelItem}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Resume Confirmation Dialog */}
      <AlertDialog
        open={deleteResumeConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteResumeConfirm({ isOpen: false, ids: [], names: [] });
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setDeleteResumeConfirm({ isOpen: false, ids: [], names: [] })}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                  Delete {deleteResumeConfirm.ids.length === 1 ? 'Resume' : `${deleteResumeConfirm.ids.length} Resumes`}
                </AlertDialogTitle>
                <p className="mt-1 text-sm text-gray-500">This action is permanent and cannot be undone.</p>
              </div>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-4">
                <div className="space-y-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <ShieldAlert className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      This action is <span className="font-semibold text-red-600">permanent</span> and{' '}
                      <span className="font-semibold text-red-600">cannot be undone</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <Lock className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      Deleted {deleteResumeConfirm.ids.length === 1 ? 'resume' : 'resumes'}{' '}
                      <span className="font-semibold text-red-600">cannot be recovered</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <AlertCircle className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      All associated data will be <span className="font-semibold text-red-600">permanently removed</span>.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-brand-orange text-brand-orange">
                    <HelpCircle className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {deleteResumeConfirm.ids.length === 1
                        ? 'Are you sure you want to delete this resume?'
                        : <>Are you sure you want to delete <span className="font-semibold text-gray-900">{deleteResumeConfirm.ids.length} resumes</span>?</>
                      }
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500">This action cannot be reversed.</p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
            <AlertDialogAction
              onClick={confirmDeleteResumes}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete {deleteResumeConfirm.ids.length === 1 ? 'Resume' : 'Resumes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog
        open={deleteFolderConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false });
          }
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false })}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <AlertDialogTitle className="pt-1 text-2xl font-bold text-gray-900">
                Delete Folder
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-4 text-left">
                {deleteFolderConfirm.loading ? (
                  <div className="space-y-3 py-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : (
                  <>
                    <p>
                      Are you sure you want to delete &quot;{deleteFolderConfirm.folderName}&quot;?
                    </p>

                    {/* Subfolder warning banner */}
                    {deleteFolderConfirm.hasSubfolders && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-800">
                              This folder contains {deleteFolderConfirm.subfolderCount} subfolder{deleteFolderConfirm.subfolderCount !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm text-red-700 mt-1">
                              All subfolders will be permanently deleted:
                            </p>
                            <ul className="mt-2 space-y-1">
                              {deleteFolderConfirm.subfolderDetails.map((sf) => (
                                <li key={sf.id} className="flex items-center gap-2 text-sm text-red-700">
                                  <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="font-medium">{sf.name}</span>
                                  {sf.resume_count > 0 && (
                                    <span className="text-red-500 text-xs">({sf.resume_count} resume{sf.resume_count !== 1 ? 's' : ''})</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Resume action section */}
                    {deleteFolderConfirm.totalResumeCount > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-amber-800">
                              {deleteFolderConfirm.totalResumeCount} resume{deleteFolderConfirm.totalResumeCount !== 1 ? 's' : ''} will be affected
                              {deleteFolderConfirm.hasSubfolders && deleteFolderConfirm.subfolderResumeCount > 0 && (
                                <span className="font-normal text-amber-700"> ({deleteFolderConfirm.resumeCount} in this folder, {deleteFolderConfirm.subfolderResumeCount} in subfolders)</span>
                              )}
                            </p>
                            <p className="text-sm text-amber-700 mt-1">
                              Please choose what to do with the resumes:
                            </p>

                            <div className="mt-3 space-y-2">
                              {(() => {
                                const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
                                const parentIsRoot = deleteFolderConfirm.parentFolderId === rootFolder?.id;

                                return (
                                  <>
                                    {/* Option: Move to parent folder */}
                                    <label
                                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                        deleteFolderConfirm.contentAction === 'move-parent'
                                          ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                                          : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/5 bg-white'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name="contentAction"
                                        value="move-parent"
                                        checked={deleteFolderConfirm.contentAction === 'move-parent'}
                                        onChange={() => setDeleteFolderConfirm(prev => ({ ...prev, contentAction: 'move-parent' }))}
                                        className="w-4 h-4 text-brand-blue"
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <FolderOpen className="w-4 h-4 text-gray-600" />
                                          <span className="text-sm font-medium text-gray-900">
                                            Move to {parentIsRoot ? 'My Resumes (root)' : deleteFolderConfirm.parentFolderName}
                                          </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                          All resumes will be moved to {parentIsRoot ? 'the root folder' : 'the parent folder'}
                                        </p>
                                      </div>
                                    </label>

                                    {/* Option: Move to root (only when parent is NOT root) */}
                                    {!parentIsRoot && (
                                      <label
                                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                          deleteFolderConfirm.contentAction === 'move-root'
                                            ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                                            : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/5 bg-white'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name="contentAction"
                                          value="move-root"
                                          checked={deleteFolderConfirm.contentAction === 'move-root'}
                                          onChange={() => setDeleteFolderConfirm(prev => ({ ...prev, contentAction: 'move-root' }))}
                                          className="w-4 h-4 text-brand-blue"
                                        />
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <Folder className="w-4 h-4 text-gray-600" />
                                            <span className="text-sm font-medium text-gray-900">
                                              Move to My Resumes (root)
                                            </span>
                                          </div>
                                          <p className="text-xs text-gray-500 mt-0.5">
                                            All resumes will be moved to the root folder
                                          </p>
                                        </div>
                                      </label>
                                    )}

                                    {/* Option: Delete all resumes */}
                                    <label
                                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                        deleteFolderConfirm.contentAction === 'delete-all'
                                          ? 'border-red-500 bg-red-50'
                                          : 'border-gray-200 hover:border-gray-300 bg-white'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name="contentAction"
                                        value="delete-all"
                                        checked={deleteFolderConfirm.contentAction === 'delete-all'}
                                        onChange={() => setDeleteFolderConfirm(prev => ({ ...prev, contentAction: 'delete-all' }))}
                                        className="w-4 h-4 text-red-600"
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <Trash2 className="w-4 h-4 text-red-600" />
                                          <span className="text-sm font-medium text-red-700">
                                            Delete all resumes permanently
                                          </span>
                                        </div>
                                        <p className="text-xs text-red-500 mt-0.5">
                                          All {deleteFolderConfirm.totalResumeCount} resume{deleteFolderConfirm.totalResumeCount !== 1 ? 's' : ''} will be permanently deleted
                                        </p>
                                      </div>
                                    </label>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={confirmDeleteFolder}
              disabled={deleteFolderConfirm.loading || (deleteFolderConfirm.totalResumeCount > 0 && !deleteFolderConfirm.contentAction)}
              className={`text-white disabled:opacity-50 disabled:cursor-not-allowed ${
                deleteFolderConfirm.contentAction === 'delete-all'
                  ? 'bg-red-700 hover:bg-red-800 focus:ring-red-600'
                  : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
              }`}
            >
              {deleteFolderConfirm.loading
                ? 'Loading...'
                : deleteFolderConfirm.contentAction === 'delete-all'
                  ? 'Delete Everything'
                  : deleteFolderConfirm.totalResumeCount > 0
                    ? 'Move & Delete'
                    : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
      </div>
    </main>
    </DndProvider>
    </FeatureGate>
  );
}

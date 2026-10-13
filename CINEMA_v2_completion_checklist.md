# CINEMATIC FORGE V2.0
## FEATURE COMPLETION CHECKLIST
### "No Stubs, No Placeholders, No Half-Shipped Features"

Every feature must pass ALL criteria before marking complete. Nothing ships to production with placeholders or "coming soon" UI.

---

## INDUSTRY-FIRST FEATURES

### 1. EMOTION LATTICE (Sprints 1-3)

#### 1.1 Backend Analysis Engine
- [ ] Model 1 (Llama Scout) integration test: Pass 5 diverse clips, verify emotional_beat objects returned
- [ ] Spline interpolation for arc shape: Test with rising/falling/circular arcs, verify math correctness
- [ ] 3-act structure detection: Verify clips map to Act I, II, III with >85% correctness on test set
- [ ] Weak point identification: Test with intentionally slow/fast paced sections, suggestions accurate
- [ ] Database schema: `emotion_analyses` table stores analyses, indexed by `clipId`, `userId`, `timestamp`
- [ ] Cache layer: Results cached in Redis for 24 hours, invalidated on clip edit
- [ ] Error handling: Graceful fallback if Model 1 unavailable (show previous analysis)

#### 1.2 Real-Time Timeline Visualization
- [ ] Emotional arc SVG chart: Renders in <500ms, smooth animation on timeline scroll
- [ ] Beat markers: Color-coded circles appear at each emotional beat, clickable to jump to timestamp
- [ ] Arc shape labels: "Rising", "Falling", "Circular", "Broken" — all visible on chart
- [ ] 3-act structure labels: Three vertical bars mark Act I/II/III boundaries, labeled
- [ ] Weak points list: Shows >0 items if issues found, each with timestamp + suggestion
- [ ] Responsive: Chart resizes correctly when panel width changes, no overflow

#### 1.3 Interaction & Guidance
- [ ] "Analyse Emotional Arc" button: Disabled until recipe has ≥3 clips, shows loading spinner during analysis (2-3min typical)
- [ ] Click weak point suggestion: Jumps playhead to timestamp, shows toast with suggestion, highlights clip in timeline
- [ ] Apply suggestion workflow: User clicks "Extend this moment +0.5s" → clip duration auto-updates, chart re-animates
- [ ] Undo/redo: Emotion-driven edits undo correctly, arc re-computes
- [ ] Keyboard shortcut: Cmd/Ctrl+E opens/closes Emotion Guide panel

#### 1.4 Integration Tests
- [ ] Full workflow: Upload 10-clip project → run analysis → verify arc shape → apply 3 suggestions → export
- [ ] Cross-browser: Chrome, Firefox, Safari all show chart correctly
- [ ] Performance: Analysis of 60-minute project completes in <5min on 4-core backend
- [ ] Concurrent users: 2 users in same project run analysis simultaneously, no race conditions

#### 1.5 Documentation & Polish
- [ ] In-app tutorial: First-time users see 3-step walkthrough (What is emotional arc? → Run analysis → Apply suggestions)
- [ ] Help text: Hover over "Emotion Guide" shows tooltip explaining what it does
- [ ] User guide: 1-page PDF explaining emotional lattice theory + how to use
- [ ] Error messages: Clear, actionable text if analysis fails ("Model unavailable, try again in 5 minutes" not "500 error")

#### 1.6 Shipping Criteria
- ✅ **DONE** = All checkboxes ✅, zero visual bugs, performance <500ms, all tests green, documentation published

---

### 2. OBJECT REMOVAL + EFFECT-AWARE INPAINTING (Sprints 4-5)

#### 2.1 Backend Integration
- [ ] FAL.ai EffectErase API: Successfully call with video URL + mask, receive job ID
- [ ] Job polling: Check status every 5 seconds, handle timeout after 10 minutes
- [ ] Output handling: Download processed video from FAL, upload to R2 with proper MIME type
- [ ] Error recovery: If FAL fails, show user "Try a simpler scene (less shadows)" + allow retry
- [ ] Cost tracking: Log credit usage per removal (estimate 50cr per removal for cost estimation)

#### 2.2 Mask Generation
- [ ] Claude Vision analysis: Pass frame + object description to Claude, get mask coordinates back
- [ ] Manual mask UI: User can draw/refine mask if auto-detection misses object
- [ ] Mask preview: Show mask overlay on frame before submitting (red highlight on masked area)
- [ ] Pre-filled prompts: Dropdown with common objects ("Person", "Microphone", "Logo", "Vehicle")

#### 2.3 UI Components
- [ ] Object Removal panel: Text input + mask toggle + blend mode selector + preview image + "Remove Object" button
- [ ] Loading state: Spinner with "Removing..." text, cancel button available
- [ ] Success state: Preview image shows before/after side-by-side, "Apply to clip" button
- [ ] Error state: Red banner with clear error + retry button, original clip untouched
- [ ] Blend mode selector: "Seamless" (default), "Conservative", "Aggressive" with tooltips

#### 2.4 Clip Replacement
- [ ] On completion: New video replaces original clip's `videoUrl`
- [ ] Timeline update: Clip thumbnail updates immediately, no manual refresh needed
- [ ] Undo: Undo removes processed version, restores original clip
- [ ] Version history: Original kept in clip metadata for comparison

#### 2.5 Integration Tests
- [ ] End-to-end: Select clip → enter "person in background" → remove → verify output is valid video file
- [ ] Mask refinement: Auto-mask, then user draws refinement, FAL respects both
- [ ] Fast removal: Scenes with simple backgrounds (<10 sec processing)
- [ ] Complex removal: Scenes with shadows/reflections processed correctly
- [ ] Error case: FAL timeout → user sees "Try again" not blank screen

#### 2.6 Documentation & Polish
- [ ] In-app tooltip: Hover over panel title explains effect-aware inpainting (removes shadows too)
- [ ] Tutorial video: 1-min demo showing object removal workflow
- [ ] Known limitations: Page documents when removal fails (moving cameras, complex lighting)
- [ ] Pro tip: Suggest cropping close to object for better results

#### 2.7 Shipping Criteria
- ✅ **DONE** = All checkboxes ✅, preview always matches final output, <2min processing for typical clip, zero failed removals in test suite

---

### 3. WIRELESS CAMERA INGEST (Sprints 6-7)

#### 3.1 Mobile Camera App (iOS)
- [ ] WebRTC streaming: iPhone connects, sends video stream to cloud in real-time
- [ ] 5-second chunks: Each 5s block uploads immediately, playable before next chunk arrives
- [ ] Auto-retry: If chunk upload fails, retry with exponential backoff, never lose data
- [ ] Recording indicator: Red "REC" pulsing on screen, time counter
- [ ] Network status: Show signal strength, upload speed (Mbps)
- [ ] Stop recording: Button confirms, uploads final chunk, closes stream cleanly

#### 3.2 Cloud Ingest Pipeline
- [ ] Chunk storage: Write to R2 with 7-day TTL (auto-delete)
- [ ] Async transcode: Start immediately, don't block on completion
- [ ] Async transcription: Run in parallel with transcode
- [ ] Async analysis: Face detection, scene category detection
- [ ] Ordering: Chunks arrive out-of-order sometimes (network variance), reconstruct correct timeline
- [ ] Idempotency: Re-uploading same chunk doesn't create duplicates

#### 3.3 Real-Time Editor Updates (WebSocket)
- [ ] New clip notification: Editor sees "📹 Camera: Interior, 2 people" appear in timeline
- [ ] Proxy ready: Clip thumbnail appears once proxy generated (<30s after chunk upload)
- [ ] Transcription streaming: Transcript appears word-by-word as transcription completes
- [ ] Scene detection: Label updates (e.g., "office" → "office with windows")
- [ ] Presence: Show "Camera is LIVE" badge in project, other editors see it

#### 3.4 Clip Assembly
- [ ] Auto track creation: Clips go to "camera-live" video track automatically created
- [ ] Ordering: Clips appear in correct chronological order on timeline
- [ ] Gap handling: No gaps between chunks (5s + 5s = 10s continuous)
- [ ] Final assembly: When camera stops recording, all chunks merged into single clip (optional, user can keep separate)
- [ ] Duration: Metadata accurate (sum of chunk durations)

#### 3.5 Transcription & Analysis
- [ ] Transcription accuracy: >95% for clear speech (test with multiple accents)
- [ ] Speaker labels: "Speaker 1", "Speaker 2" identified if multiple people
- [ ] Timestamps: Each word linked to video timestamp, editable by user
- [ ] Scene labels: "outdoor", "indoor", "bright", "dark" applied correctly
- [ ] Face detection: Count of faces displayed (helps editor know if all talent present)

#### 3.6 Permissions & Multi-User
- [ ] Recording permission prompt: iOS asks for camera/mic access (only once)
- [ ] Project sharing: Camera ingest only works if user has EDIT permission on project
- [ ] Live badge: Show which user is currently streaming camera
- [ ] Concurrent recording: Only one camera per project can stream at a time (UI prevents double-start)

#### 3.7 Error Handling
- [ ] Network drop: Auto-reconnect, resume where left off, no data loss
- [ ] App backgrounded: Recording pauses, user re-opens app, resumes cleanly
- [ ] Camera permission denied: Clear error, link to settings
- [ ] Chunk failed: Retry up to 3x, then skip (show warning in timeline)
- [ ] Transcription fails: Chunk still usable, just without transcript (editor can transcribe manually later)

#### 3.8 Integration Tests
- [ ] Full workflow: Start session → stream 2 min of video → stop → verify 24 5s chunks on timeline → play through
- [ ] Network interruption: Simulate WiFi drop at 45s, reconnect, complete upload
- [ ] Multiple editors: Editor A streaming camera, Editor B watching timeline update in real-time
- [ ] Cross-browser sharing: Open session link in Chrome (desktop), iPhone records in Safari, both sync correctly

#### 3.9 Documentation & Polish
- [ ] In-app onboarding: First time user clicks "Start Streaming", sees 3-step guide
- [ ] QR code: Session link displayed as QR for easy phone scanning
- [ ] Status dashboard: Show upload speed, transcription progress, faces detected
- [ ] Tutorial: 2-min video showing end-to-end workflow

#### 3.10 Shipping Criteria
- ✅ **DONE** = Zero lost chunks, <1sec latency from camera to editor timeline, transcription >95% accurate, works on 4G & WiFi, no network-related data loss in test suite

---

## COLLABORATIVE FEATURES

### 4. REAL-TIME MULTIPLAYER TIMELINE (Sprints 8-10)

#### 4.1 Operational Transform (OT) / CRDT
- [ ] State sync: 2 users open same project, both see identical timeline
- [ ] Concurrent edits: User A adds clip, User B deletes clip simultaneously → both operations apply in correct order
- [ ] Conflict resolution: If both edit same clip's duration, last-write-wins (predictable, not random)
- [ ] Undo/redo: Works correctly with concurrent edits (undo only undoes user's own changes)
- [ ] Performance: Sync latency <200ms for typical edits

#### 4.2 Presence Indicators
- [ ] Live cursors: See where other users' playheads are on timeline (color-coded)
- [ ] User names: Hover over cursor shows "Alice", "Bob"
- [ ] Activity feed: "Alice moved clip 3", "Bob added video track" appear in sidebar (last 10 actions)
- [ ] Status: "Alice is idle", "Bob watching at 2:15", "Charlie typing in comment"
- [ ] Disconnect: User disconnects, their presence disappears after 5s

#### 4.3 Comments & Frame Annotation
- [ ] Right-click clip: "Add comment" opens text box, submits with Enter
- [ ] Comment display: Appears as speech bubble on clip, shows commenter name + timestamp
- [ ] Threading: Click comment to see full thread (parent + replies)
- [ ] @ mentions: Type @Alice to notify her, she gets toast + email
- [ ] Resolve: Checkbox marks comment "resolved", grayed out but still visible
- [ ] Pin important: Star icon marks important comments, float to top

#### 4.4 Conflict Prevention
- [ ] Clip locking: User A locks clip for editing, User B sees lock icon, cannot edit
- [ ] Duration editing: If User A is trimming clip, User B cannot simultaneously trim same clip
- [ ] Track locking: User can lock entire track (e.g., "Don't touch the music")
- [ ] Clear locks: Locks auto-expire after 10 min of inactivity, manual unlock available

#### 4.5 Permission Levels
- [ ] VIEW: Can watch, cannot edit anything
- [ ] EDIT: Can edit clips, add comments, not delete/share
- [ ] ADMIN: Full access, can delete, change permissions, invite users
- [ ] Granular: Could restrict VIEW to read-only, EDIT to certain tracks only (future)
- [ ] Assign: Admin clicks user → permission selector, takes effect immediately

#### 4.6 Integration Tests
- [ ] 3-user scenario: A, B, C open same project. A adds clip, B moves it, C changes color. All see same final state.
- [ ] Lock test: A locks clip, B tries to edit, gets "locked" error, A unlocks, B can edit immediately
- [ ] Comment thread: A adds comment, B replies, A replies to B, thread shows correctly for C joining later
- [ ] Disconnect/reconnect: A edits offline (not really possible since cloud-based, but test re-connection after network drop)

#### 4.7 Documentation & Polish
- [ ] Onboarding: First collab project shows "Invite a teammate" button, walkthrough
- [ ] Help: "How to collaborate" docs explaining permissions, locking, comments
- [ ] Conflict tooltip: When edit blocked by lock, tooltip shows "Sarah is editing this, try again in 30s"

#### 4.8 Shipping Criteria
- ✅ **DONE** = Zero lost edits with concurrent users, <200ms sync latency, all conflict tests passing, locking prevents race conditions

---

### 5. PRESENCE INDICATORS & CONFLICT RESOLUTION (Sprints 11-12)

*(Covered above under Real-Time Multiplayer, no additional work needed)*

---

## ADVANCED FEATURES

### 6. ROUGH CUT COPILOT (Sprints 13-15)

#### 6.1 Footage Analysis
- [ ] Model 1 analysis: Run all clips through Llama Scout, get `take_quality`, `emotional_beat`, `technical_issues`
- [ ] Quality scoring: Track focus, exposure, audio levels, detect shaky/out-of-focus footage
- [ ] Best-take detection: Identify which take of same scene is sharpest, clearest
- [ ] B-roll identification: Flag clips that are supplementary (less important)
- [ ] Dialogue vs action: Classify clips as interview/dialogue-heavy vs action/visual

#### 6.2 Rough Cut Assembly
- [ ] Style selection: User chooses "fast-paced", "cinematic", "documentary", "interview", "music-video"
- [ ] Tone selection: User chooses "energetic", "serious", "humorous", "emotional"
- [ ] Target duration: User enters desired length (e.g., 5 minutes)
- [ ] Model 1 assembly: Llama Scout builds timeline JSON with: clip order, start times, transition suggestions
- [ ] Reasoning: For each cut, include "why" (e.g., "establishes location", "reaction shot")

#### 6.3 Timeline Generation
- [ ] Recipe creation: Convert rough cut JSON to TimelineRecipe with all clips positioned
- [ ] Track organization: Automatically create V1, A1, A2 tracks, place clips correctly
- [ ] Duration: Verify output matches target duration (±5% acceptable)
- [ ] Gaps: No gaps between clips (unless intentional silence)
- [ ] Ordering: Clips in logical narrative order

#### 6.4 B-Roll Suggestions
- [ ] Gap detection: Identify places where B-roll would improve pacing
- [ ] Stock search: Suggest searching for specific keywords (e.g., "office building exterior", "coffee shop")
- [ ] Generation fallback: If no stock found, suggest generating B-roll via Veo 3 (show cost in credits)
- [ ] Auto-insert: User clicks "Fill gap with generated B-roll" → generates, inserts, plays

#### 6.5 UI Workflow
- [ ] Dialog trigger: File → "Generate Rough Cut..." opens dialog
- [ ] Options form: Style, tone, target duration, confirm button
- [ ] Loading: Shows "Analysing footage..." (2-3 min typical)
- [ ] Preview: Shows proposed timeline as preview (don't replace user's current timeline)
- [ ] Approval: "Use this rough cut" button creates new timeline from proposal
- [ ] Refinement: User can manually adjust proposed timeline before using

#### 6.6 Integration Tests
- [ ] 10-clip footage + 5-min target → rough cut completes in <3min, output is 5±15s
- [ ] Style consistency: "music-video" style produces faster cuts than "documentary" on same footage
- [ ] B-roll suggestions: System suggests B-roll for gaps >2s
- [ ] Generation fallback: If no stock available, proposes generating (shows credit cost)

#### 6.7 Documentation & Polish
- [ ] Tutorial: "How rough cuts save 4 hours per project" video
- [ ] Examples: Show 3 different style outputs for same footage
- [ ] Limitations: "Works best with ≥5 clips, clear audio, diverse shots"

#### 6.8 Shipping Criteria
- ✅ **DONE** = Rough cut output always usable (plays without errors), duration within 5% of target, user prefers it to manual assembly in 70% of cases

---

### 7. AI COLOUR GRADING SUGGESTIONS (Sprints 16-17)

#### 7.1 Frame Analysis
- [ ] Extract frame: Get middle frame of clip (or let user select frame)
- [ ] Colour space detection: Identify current color temperature, saturation, contrast
- [ ] Lighting analysis: Shadows dark/lifted? Highlights blown/controlled?
- [ ] Scene context: Is this outdoors/indoors? Bright/dark? Day/night?

#### 7.2 Grade Suggestion Engine
- [ ] Mood-based suggestions: "Warm" mood → suggest +200K color temp, lift shadows, desaturate slightly
- [ ] LUT recommendations: Suggest cinematic LUT (Kodachrome, IMAX, Blade Runner, etc.)
- [ ] Cross-clip matching: If user grades clip A, system suggests matching color for clip B (shot same scene/time)
- [ ] Technical correction: Highlight blown exposure, suggest curve adjustment
- [ ] Safety ranges: Ensure suggestions don't exceed broadcast-safe levels

#### 7.3 Grade Application
- [ ] One-click apply: Button applies entire suggested grade to clip
- [ ] Adjustment sliders: User fine-tunes after applying (exposure ±0.5 stops, saturation ±10)
- [ ] Before/after: Split-screen comparison of original vs graded
- [ ] Undo: Revert to original any time
- [ ] Copy grade: Apply same grade to multiple clips (e.g., all outdoor scenes)

#### 7.4 Integration with Timeline
- [ ] Grade persistence: Grade saved in clip metadata, survives export
- [ ] Timeline view: Color-graded thumbnails shown in timeline (not just placeholder gray)
- [ ] Batch suggestions: "Suggest grades for all 15 clips" → applies to video track clips
- [ ] Grade curve display: Right panel shows luminosity curve, user can see what changed

#### 7.5 Integration Tests
- [ ] Mood test: Suggest "warm" → verify color temp increases, shadows lift
- [ ] LUT test: Apply "Blade Runner" → verify output matches reference grade
- [ ] Cross-clip: Grade clip A, apply to clip B → colors match visually
- [ ] Undo: Apply grade, undo, original restored perfectly

#### 7.6 Documentation & Polish
- [ ] Tooltip: "AI suggests moody grades based on scene lighting — adjust to taste"
- [ ] Tutorial: "5-minute color grading guide for non-colorists"
- [ ] LUT library: Show all available looks with previews (not just dropdown)

#### 7.7 Shipping Criteria
- ✅ **DONE** = Suggested grades look professional, colors match across clips within 5% ΔE, all LUTs applied without posterization

---

### 8. NATIVE SPATIAL VIDEO EDITING (Sprints 18-19)

#### 8.1 Import Spatial Video
- [ ] Format detection: Recognize MV-HEVC (Apple spatial), SBS 3D, TAB format automatically
- [ ] Metadata extraction: Pull baseline, FOV, stereo offset from file
- [ ] Compatibility check: Warn if format not compatible with Vision Pro export
- [ ] Timeline track: Add "spatial-v1" track, place clip with spatial metadata intact

#### 8.2 Editing Spatial Clips
- [ ] Pan/tilt/roll: Show 3D orientation controls (three sliders, 6DoF preview)
- [ ] Depth adjustment: Let user adjust perceived depth (increase parallax for more 3D feel)
- [ ] Masking spatial: Advanced: mask part of stereo view (e.g., remove distracting object from left eye only)
- [ ] Transition support: Fade between spatial clips, other spatial-aware transitions

#### 8.3 2D → Spatial Conversion
- [ ] AI depth estimation: Upload 2D video, system generates stereo using depth AI
- [ ] Quality selection: "Fast" (30s, lower quality) vs "High quality" (2min, better depth)
- [ ] Preview on Vision Pro: If user has Vision Pro connected, preview converted spatial video in 3D
- [ ] Fallback: If conversion fails, keep as 2D (don't break timeline)

#### 8.4 Export to Vision Pro
- [ ] Format selection: Export as Apple Immersive Video (for spatial playback)
- [ ] Encoding: Use Apple Compressor API or DaVinci plugin to encode properly
- [ ] Metadata inclusion: Embed correct FOV, baseline, disparity for headset playback
- [ ] File download: Provide .mov file with spatial metadata correct
- [ ] QR code: Generate QR to airdrop to Vision Pro immediately

#### 8.5 Integration Tests
- [ ] Import test: Load iPhone 16 spatial video, verify metadata, timeline shows spatial indicator
- [ ] Edit test: Pan/tilt stereo clip, export, verify in Vision Pro
- [ ] Conversion test: 2D clip → stereo conversion → export → Vision Pro playback shows depth
- [ ] Multi-clip: 5 spatial clips in sequence, export, plays continuously on Vision Pro

#### 8.6 Documentation & Polish
- [ ] In-app badge: "📱 Spatial video" label on spatial clips in timeline
- [ ] Export reminder: "Vision Pro playback preview available if headset connected"
- [ ] Tutorial: "Creating spatial video for Vision Pro" guide with examples

#### 8.7 Shipping Criteria
- ✅ **DONE** = Spatial video plays on Vision Pro without artifacts, 2D→spatial conversion looks natural, all metadata preserved in export

---

## COMMERCE FEATURES

### 9. SHOPPABLE EXPORT BUILDER (Sprints 20-22)

#### 9.1 Product Tagging UI
- [ ] Timeline scrubber: Drag playhead to moment product appears
- [ ] Tag button: Click "Add product tag" at current timestamp
- [ ] Product search: Search Shopify/WooCommerce catalog (or manual entry)
- [ ] Product card: Image, name, price, variants (color, size, etc.)
- [ ] Tag positioning: Manually position hotspot on video frame (or auto-center)
- [ ] Multiple tags: Add >1 product per timestamp (e.g., person wearing shirt + shoes)

#### 9.2 Tag Management
- [ ] List view: Right panel shows all tags in chronological order
- [ ] Edit: Click tag to change product, move timestamp, reposition hotspot
- [ ] Delete: Remove tag (can't delete product if video already exported)
- [ ] Batch: Select multiple tags, delete/move together
- [ ] Sorting: Sort by time, product name, price

#### 9.3 E-commerce Integration
- [ ] Shopify API: Fetch products, variants, pricing from Shopify store
- [ ] WooCommerce API: Same for WooCommerce stores
- [ ] Manual entry: User types product name, price, link if not in system
- [ ] Inventory sync: Show "In stock" / "Out of stock" status (pull from API)
- [ ] Pricing: Show real-time prices (update if price changes in Shopify)

#### 9.4 Shoppable Player Export
- [ ] Config generation: Build JSON with video URL, all hotspots, product data
- [ ] Hosting: Upload to R2 with CDN caching
- [ ] Embed code: Generate HTML iframe snippet for user's website
- [ ] Shareable link: Create direct playable URL (e.g., cinemaforge.io/watch/abc123)
- [ ] Analytics: Track clicks, add-to-carts, conversions (optional, can integrate with Shopify analytics)

#### 9.5 Player Features
- [ ] Hotspot rendering: Clickable circles appear on video at correct timestamps
- [ ] Product card: Click hotspot → product card slides in with image, name, price, variants
- [ ] "Add to Cart": Button adds to Shopify/WooCommerce cart
- [ ] Checkout: Direct to store checkout (don't handle payment on Cinematic Forge)
- [ ] Responsive: Works on mobile (hotspots scale correctly)
- [ ] Fallback: Works without JavaScript enabled (graceful degradation)

#### 9.6 Integration Tests
- [ ] End-to-end: Add 5 products to video → export → embed on website → click product → add to cart in Shopify
- [ ] Variants: Product with 3 colors, user selects color, adds to cart (color remembered)
- [ ] Out of stock: Product goes out of stock in Shopify, player shows "Out of stock" (no add-to-cart)
- [ ] Analytics: Click event tracked and appears in Shopify analytics

#### 9.7 Documentation & Polish
- [ ] Tutorial: "Create shoppable video in 5 minutes" video
- [ ] Examples: Show 3 examples (fashion haul, product review, unboxing) with embeddings
- [ ] FAQ: "Do I need Shopify?", "How do I get paid?", etc.

#### 9.8 Shipping Criteria
- ✅ **DONE** = 100% of clicks result in product added to cart, no broken links, conversion tracking accurate, mobile fully functional

---

### 10. SHOPIFY/WOOCOMMERCE INTEGRATIONS (Sprints 23-24)

#### 10.1 Shopify Integration
- [ ] OAuth flow: User connects Shopify store via OAuth, we get access token
- [ ] Product sync: Fetch all products, variants, prices from Shopify
- [ ] Inventory check: Pull real-time stock levels
- [ ] Cart integration: "Add to cart" creates cart session in Shopify
- [ ] Checkout redirect: Seamless handoff to Shopify checkout
- [ ] Order tracking: Optional: track orders back to video (UTM parameter)

#### 10.2 WooCommerce Integration
- [ ] API connection: User provides WooCommerce API key/secret
- [ ] Product fetch: REST API pulls products, variants, inventory
- [ ] Same cart flow: "Add to cart" works identically to Shopify
- [ ] Checkout: Redirect to WooCommerce checkout (WordPress site)

#### 10.3 Custom Store Support
- [ ] API documentation: Provide webhook/API docs for custom integrations
- [ ] Postback events: Send "product_clicked", "add_to_cart", "converted" webhooks to merchant's server
- [ ] Attribution: Include video ID + product ID in each event for tracking

#### 10.4 Payment & Revenue Share
- [ ] No payment processing on Cinematic Forge: We don't touch money (Shopify/WooCommerce handle checkout)
- [ ] Affiliate tracking: Optional: merchant sets affiliate code, we include in checkout URL
- [ ] Revenue model: Cinematic Forge premium tier includes shoppable exports (not separate upsell)

#### 10.5 Integration Tests
- [ ] Shopify: Connect test store → add product tag → export → verify cart works
- [ ] WooCommerce: Connect test site → add tags → export → verify checkout
- [ ] Stock sync: Product sells out in Shopify, player updates within 5min
- [ ] Event tracking: Click event logged to merchant's analytics

#### 10.6 Documentation & Polish
- [ ] Setup guide: "Connect your Shopify store in 2 minutes" (screenshots)
- [ ] FAQ: "How do I get paid?", "Does Cinematic Forge take a cut?"
- [ ] Support: Help center article for common issues

#### 10.7 Shipping Criteria
- ✅ **DONE** = All integrations functional, no cart abandonment due to broken linking, revenue attribution accurate

---

## INTEGRATIONS

### 11. UNREAL ENGINE SEQUENCER EXPORT (Sprints 25-27)

#### 11.1 Sequencer File Generation
- [ ] UE5 format: Generate valid .uasset file (Unreal binary format)
- [ ] Track creation: Create video tracks, place all clips with correct timing
- [ ] Metadata: Include project FPS, resolution, duration in sequencer
- [ ] Media import: Copy media files to UE project Content/Media folder (or link via path)
- [ ] Naming: Auto-name sequencer "CF_[ProjectID]_[ExportDate]"

#### 11.2 Export Dialog
- [ ] Trigger: File → "Export to Unreal Engine"
- [ ] Path input: User enters local Unreal project path (e.g., "D:/MyFilm/Unreal/")
- [ ] Validation: Check path exists, is valid Unreal project
- [ ] Media copy: Option to copy media files or link (affects file size)
- [ ] Export button: Generates .uasset and manifest

#### 11.3 Unreal Integration
- [ ] Sequencer opens: User opens UE5 → opens Sequencer → loads CF_[ProjectID] → all clips visible
- [ ] Clip trimming: UE5's in-editor timeline respects clip durations from Cinematic Forge
- [ ] Resolution/FPS: Inherited from Cinematic Forge (don't force UE default)
- [ ] Camera track: If timeline has camera moves (future feature), they import as camera track

#### 11.4 VFX/Rendering Workflow
- [ ] Virtual production: User can add UE5 backgrounds, layer with imported clips
- [ ] Real-time preview: Sequencer shows composited preview (UE clips + real clips)
- [ ] Render export: User can render sequence from UE5 back to video
- [ ] No re-encoding: Original clips preserved, just composited

#### 11.5 Manifest File
- [ ] JSON manifest: Includes all clip metadata, paths, timing for reference
- [ ] Round-trip: User can modify in UE, re-import manifest back to Cinematic Forge (future feature)
- [ ] Validation: Manifest lists all external files (for asset management)

#### 11.6 Integration Tests
- [ ] Export test: Timeline with 10 clips → export to UE project → sequencer opens, all clips visible
- [ ] Path validation: User enters wrong path → clear error message
- [ ] Media copy: "Copy media files" option copies all media to UE folder correctly
- [ ] Round-trip: Export → edit in UE → import back (future feature test)

#### 11.7 Documentation & Polish
- [ ] Setup guide: "Exporting to Unreal Engine" step-by-step tutorial
- [ ] Examples: Show "before" (Cinematic Forge) and "after" (with UE backgrounds added)
- [ ] Troubleshooting: "Sequencer won't open", "Media files not found" solutions

#### 11.8 Shipping Criteria
- ✅ **DONE** = Export generates valid .uasset, Unreal opens without errors, all clips play with correct timing, media files accessible in UE

---

## INFRASTRUCTURE & POLISH

### 12. ENVIRONMENT VARIABLES & CONFIGURATION (All Sprints)

#### 12.1 All Required ENV Vars
```
# Authentication
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_ID= (optional)
GITHUB_SECRET= (optional)

# Database
DATABASE_URL=postgresql://...  # Prod DB
DB_PRODUCT=postgresql://...    # 4 isolated domains
DB_TECHNICAL=postgresql://...
DB_INTELLIGENCE=postgresql://...
DB_MARKETING=postgresql://...

# Cache
REDIS_URL=redis://...          # Prod cache
REDIS_PRODUCT=redis://...      # 4 namespaces
REDIS_TECHNICAL=redis://...
REDIS_INTELLIGENCE=redis://...
REDIS_MARKETING=redis://...

# Storage
R2_BUCKET_NAME=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_REGION=
R2_PUBLIC_URL=

# VLM APIs
KLING_API_KEY=
SEEDANCE_API_KEY=
LUMA_API_KEY=
RUNWAY_API_KEY=
PIKA_API_KEY=
MINIMAX_API_KEY=
HUNYUANVIDEO_API_KEY=
SORA_API_KEY=
VEO3_API_KEY=

# AI Models
ANTHROPIC_API_KEY= (PRODUCT domain)
ANTHROPIC_API_KEY_TECHNICAL= (TECHNICAL domain)
ANTHROPIC_API_KEY_INTELLIGENCE= (INTELLIGENCE domain)
ANTHROPIC_API_KEY_MARKETING= (MARKETING domain)
LLAMA_SCOUT_ENDPOINT= (local vLLM server)
MOCHI_ENDPOINT= (Model 2 inference)

# E-commerce
SHOPIFY_API_KEY=
SHOPIFY_API_PASSWORD=
WOOCOMMERCE_API_KEY=
WOOCOMMERCE_API_SECRET=
STRIPE_SECRET_KEY=
STRIPE_PUBLIC_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_SECRET=

# Services
TWILIO_ACCOUNT_SID= (SMS, optional)
TWILIO_AUTH_TOKEN=
SENDGRID_API_KEY= (email)
SUNO_API_KEY= (music generation, optional)

# URLs
NEXT_PUBLIC_APP_URL=https://cinemaforge.io
NEXT_PUBLIC_LUMA_API_URL=https://api.luma.ai

# Feature Flags
FEATURE_EMOTION_LATTICE=true
FEATURE_OBJECT_REMOVAL=true
FEATURE_CAMERA_INGEST=true
FEATURE_COLLAB=true
FEATURE_SHOPPABLE=true
FEATURE_UNREAL_EXPORT=true

# Logging
LOG_LEVEL=info
SENTRY_DSN= (error tracking)

# Development
NODE_ENV=production
DEBUG=false
```

- [ ] All vars listed in `.env.example`
- [ ] All vars documented in README (what each one does)
- [ ] All vars validated at startup (app refuses to start if critical ones missing)
- [ ] Secrets never logged (sanitize in error messages)
- [ ] Rotation: Plan for key rotation (Stripe, Shopify, etc.)

#### 12.2 Database Migrations
- [ ] All tables created: `projects`, `clips`, `timelines`, `users`, `emotion_analyses`, `removal_jobs`, `camera_sessions`, `shoppable_tags`, `grades`, `spatial_clips`
- [ ] Indexes created on common queries (userId, projectId, timestamp)
- [ ] Foreign keys correct
- [ ] Migration scripts (up/down) for all schema changes
- [ ] Test database can be reset cleanly

#### 12.3 Error Handling
- [ ] No 500 errors leak stack traces to user (caught, logged, generic message shown)
- [ ] All API endpoints return structured error JSON: `{ error: string, code: string, timestamp: ISO }`
- [ ] User-facing errors are actionable ("Credit limit reached" not "InsertError")
- [ ] Sentry integration captures all errors for debugging

#### 12.4 Performance
- [ ] Page load <2 seconds (LCP)
- [ ] Timeline operations <100ms
- [ ] API endpoints <500ms (p95)
- [ ] Search features <1 second
- [ ] Lighthouse score >85

#### 12.5 Security
- [ ] HTTPS everywhere
- [ ] CSRF protection (Next.js built-in)
- [ ] Rate limiting: 10 reqs/sec per IP, 100 reqs/sec authenticated
- [ ] SQL injection: All queries use parameterized statements (Prisma)
- [ ] XSS: All user input escaped (React default)
- [ ] Authentication: NextAuth.js, no tokens in localStorage (httpOnly cookies)
- [ ] CORS: Restricted to cinemaforge.io domains only

#### 12.6 Monitoring
- [ ] Uptime monitoring: Ping health check endpoint every 60s
- [ ] Database monitoring: Query performance, connection pool health
- [ ] Cache monitoring: Hit rate, eviction rate
- [ ] API monitoring: Error rates, latency percentiles, request volume
- [ ] Dashboards: 1 executive dashboard, 1 engineering dashboard

---

## TESTING & QA

### 13. TEST COVERAGE (Continuous)

#### 13.1 Unit Tests
- [ ] >80% coverage on business logic (not UI)
- [ ] All VLM routing rules tested
- [ ] All clip operation functions (trim, split, move) tested
- [ ] All emotion analysis functions tested
- [ ] All color grading functions tested

#### 13.2 Integration Tests
- [ ] Full workflows (import → edit → export) for each feature
- [ ] Multi-user scenarios (concurrent edits)
- [ ] Error recovery (network failures, API timeouts)
- [ ] Payment flows (Stripe, PayPal)
- [ ] E-commerce integrations (Shopify, WooCommerce)

#### 13.3 E2E Tests (Playwright)
- [ ] Happy path: Create project → upload footage → edit → export → download
- [ ] Collab: 2 users open project, edit simultaneously, verify sync
- [ ] Mobile: Camera ingest on iOS, verify timeline updates
- [ ] Commerce: Add shoppable tags, embed, verify player works

#### 13.4 Performance Tests
- [ ] Load test: 100 concurrent users editing same project
- [ ] Memory: No memory leaks after 1 hour of editing
- [ ] Latency: API p95 latency under 500ms
- [ ] Search: Searching 10,000 clips returns results <1 second

#### 13.5 Accessibility
- [ ] WCAG 2.1 AA compliance
- [ ] Keyboard navigation for all features
- [ ] Screen reader support (ARIA labels)
- [ ] Color contrast >4.5:1 for text
- [ ] No autoplay (videos start on user click)

---

### 14. QUALITY ASSURANCE

#### 14.1 Browser Testing
- [ ] Chrome (latest 2 versions)
- [ ] Firefox (latest 2)
- [ ] Safari (latest 2)
- [ ] Edge (latest 2)
- [ ] Mobile: iOS Safari, Android Chrome

#### 14.2 Device Testing
- [ ] Desktop (1920x1080, 2560x1440, 3440x1440 ultrawide)
- [ ] Laptop (1366x768)
- [ ] iPad
- [ ] iPhone SE, iPhone Pro Max, iPhone Pro

#### 14.3 Network Conditions
- [ ] 4G: Simulate slow connection (API latency >1s)
- [ ] WiFi: Normal conditions
- [ ] 5G: Fast connection
- [ ] Offline → online: Verify recovery

#### 14.4 Localizations
- [ ] English (primary)
- [ ] Spanish, French, German (future)
- [ ] Right-to-left support (future)
- [ ] Date/time formatting locale-aware
- [ ] Currency formatting (USD primary, others future)

#### 14.5 Bug Triage
- [ ] All bugs assigned severity (Critical, High, Medium, Low)
- [ ] Critical: Fixed before shipping
- [ ] High: Fixed within 1 sprint
- [ ] Medium: Fixed within 3 sprints
- [ ] Low: Backlog (fix when time allows)

---

## DOCUMENTATION

### 15. USER-FACING DOCUMENTATION

#### 15.1 Help Articles
- [ ] "Getting started with Cinematic Forge"
- [ ] "Understanding the timeline"
- [ ] "How emotion lattice works"
- [ ] "Object removal step-by-step"
- [ ] "Streaming from your iPhone camera"
- [ ] "Collaborating with teammates"
- [ ] "Creating shoppable videos"
- [ ] "Exporting to Unreal Engine"
- [ ] "Keyboard shortcuts" (exhaustive list)
- [ ] "FAQ" (20+ common questions)

#### 15.2 Tutorials
- [ ] Video: "5-minute rough cut from raw footage"
- [ ] Video: "Emotion lattice: pacing your story"
- [ ] Video: "Remove unwanted objects in 30 seconds"
- [ ] Video: "Stream directly from your iPhone"
- [ ] Video: "Invite teammates and collaborate"
- [ ] Video: "Add products and create shoppable video"
- [ ] Video: "Export to Unreal for VFX"

#### 15.3 Onboarding
- [ ] First-time user sees welcome slide
- [ ] Interactive tutorial (3-5 min) showing core features
- [ ] Opt-in: Skip tutorial option available
- [ ] Contextual tips: First time using emotion lattice, show tooltip

#### 15.4 In-App Help
- [ ] Every panel has help icon (?) with brief tooltip
- [ ] Buttons have hover text explaining what they do
- [ ] Error messages are clear and actionable
- [ ] Link to help article from errors (e.g., "Learn more")

#### 15.5 API Documentation
- [ ] Endpoint reference (all /api/* routes)
- [ ] Authentication (NextAuth.js)
- [ ] Rate limits
- [ ] Webhooks (for e-commerce integrations)
- [ ] SDKs (JavaScript, Python optional)

---

### 16. INTERNAL DOCUMENTATION

#### 16.1 Architecture Docs
- [ ] System overview (diagram: UI → API → Workers → Services)
- [ ] Database schema (ERD diagram)
- [ ] VLM routing logic (flowchart)
- [ ] Multi-user sync (CRDT/OT explanation)
- [ ] Payment flows (Stripe, PayPal)

#### 16.2 Development Guide
- [ ] "How to add a new feature"
- [ ] "VLM integration checklist"
- [ ] "Testing new endpoints"
- [ ] "Deploying to production"
- [ ] "Common issues & solutions"

#### 16.3 Runbooks
- [ ] "Incident response: API down"
- [ ] "Database migration rollback"
- [ ] "VLM API key rotation"
- [ ] "Customer data recovery"
- [ ] "Emergency disabling a feature"

---

## FINAL SHIPPING CHECKLIST

Before marking V2.0 complete, verify:

### Code Quality
- [ ] No console.errors in production (checked via Sentry)
- [ ] No console.logs except for debugging (removed or wrapped in DEBUG flag)
- [ ] ESLint passes on all files
- [ ] TypeScript strict mode passes (no any, no implicit any)
- [ ] All imports resolved (no broken links)

### Performance
- [ ] Lighthouse score >85 (all pages)
- [ ] API p95 latency <500ms
- [ ] Page load LCP <2s
- [ ] No memory leaks (profiler test)

### Security
- [ ] No secrets in code (checked via scanning tools)
- [ ] All endpoints authenticated/authorized
- [ ] HTTPS enforced
- [ ] Database credentials rotated
- [ ] API keys in .env, never in code

### Testing
- [ ] >80% unit test coverage
- [ ] All integration tests passing
- [ ] All E2E tests passing
- [ ] Performance tests passing
- [ ] Manual QA sign-off from product team

### Documentation
- [ ] All features documented in help center
- [ ] All endpoints documented in API docs
- [ ] README up-to-date
- [ ] Changelog updated
- [ ] No TODO comments left in code

### Deployment
- [ ] All ENV vars set in production
- [ ] Database migrations applied
- [ ] Caches warmed (if needed)
- [ ] CDN cache cleared
- [ ] Monitoring alerts configured
- [ ] Incident response team notified (going live)

### Post-Launch
- [ ] Monitor error rate (should be <0.1%)
- [ ] Monitor API latency (p95 should stay <500ms)
- [ ] Monitor database (no slow queries)
- [ ] User feedback channels open
- [ ] Rollback plan ready (if major issues emerge)

---

## SUMMARY: V2.0 DEFINITION OF DONE

**V2.0 ships when:**

✅ All 15 features functional and tested  
✅ All 3 industry-firsts working end-to-end  
✅ Zero critical/high bugs  
✅ All documentation published  
✅ Performance targets met  
✅ Security audit passed  
✅ Product team sign-off  
✅ Launch communications ready  

**No shipping with:**
- ❌ Placeholder UIs ("Coming soon", "TBD")
- ❌ Stub functions (return null, TODO comments)
- ❌ Broken error handling
- ❌ Missing API endpoints
- ❌ Untested features
- ❌ Incomplete documentation
- ❌ Performance issues
- ❌ Security gaps

**V2.0 is a COMPLETE, SHIPPING, PRODUCTION-READY release.**

---

*Cinematic Forge V2.0 — Feature Completion Checklist*  
*"Complete means Complete" — No Stubs, No Placeholders, No Half-Shipped Features*

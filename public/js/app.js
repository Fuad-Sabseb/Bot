// Campus Super App — Academic Portal Front-End Controller

let activeAssignment = null;
let selectedFile = null;
let currentUser = null;

function getAuthHeader() {
  const token = localStorage.getItem("campus_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ----------------------------------------------------
// AUTHENTICATION & SESSION MANAGEMENT
// ----------------------------------------------------
async function checkAuthSession() {
  const token = localStorage.getItem("campus_access_token");
  const displayName = document.getElementById("userDisplayName");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!token) {
    currentUser = null;
    displayName.innerText = "Guest (Not Logged In)";
    logoutBtn.style.display = "none";
    return false;
  }

  try {
    const res = await fetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await res.json();

    if (result.success && result.data) {
      currentUser = result.data;
      const roleStr = currentUser.globalRoles?.[0] || "USER";
      displayName.innerText = `👤 ${currentUser.fullName} (${roleStr})`;
      logoutBtn.style.display = "inline-block";
      return true;
    } else {
      localStorage.removeItem("campus_access_token");
      currentUser = null;
      displayName.innerText = "Guest (Session Expired)";
      logoutBtn.style.display = "none";
      return false;
    }
  } catch (err) {
    console.error("Auth verification failed:", err);
    return false;
  }
}

document.getElementById("openAuthModalBtn").addEventListener("click", () => {
  document.getElementById("authModal").classList.remove("hidden");
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const identifier = document.getElementById("loginIdentifier").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const result = await res.json();

    if (result.success && result.data?.accessToken) {
      localStorage.setItem("campus_access_token", result.data.accessToken);
      alert("✅ Logged in successfully!");
      closeModal("authModal");
      await checkAuthSession();
      loadDashboard();
      loadNotifications();
    } else {
      alert(`Login failed: ${result.error?.message || result.error || "Invalid credentials"}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
});

document.getElementById("saveManualTokenBtn").addEventListener("click", async () => {
  const token = document.getElementById("manualTokenInput").value.trim();
  if (!token) return alert("Please enter a valid JWT token");
  localStorage.setItem("campus_access_token", token);
  closeModal("authModal");
  await checkAuthSession();
  loadDashboard();
  loadNotifications();
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("campus_access_token");
  currentUser = null;
  checkAuthSession();
  closeModal("authModal");
  loadDashboard();
});

// ----------------------------------------------------
// UI TABS & NAVIGATION
// ----------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));

    btn.classList.add("active");
    const target = document.getElementById(`tab-${btn.dataset.tab}`);
    if (target) target.classList.remove("hidden");

    if (btn.dataset.tab === "dashboard") loadDashboard();
    if (btn.dataset.tab === "materials") {
      loadMaterials();
      loadMaterialsStats();
      loadMaterialsOfferings();
    }
    if (btn.dataset.tab === "archive") {
      loadArchive();
      loadArchiveStats();
      loadArchiveOfferings();
    }
    if (btn.dataset.tab === "quizzes") {
      loadQuizzesOfferings();
      loadQuizzes();
    }
    if (btn.dataset.tab === "groups") loadGroupAssignmentsDropdown();
    if (btn.dataset.tab === "teacher") loadTeacherOfferings();
  });
});

// Notification Dropdown Toggle
const notifBellBtn = document.getElementById("notifBellBtn");
const notifDropdown = document.getElementById("notifDropdown");
notifBellBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  notifDropdown.style.display = notifDropdown.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", () => {
  if (notifDropdown) notifDropdown.style.display = "none";
});

// ----------------------------------------------------
// 1. STUDENT ASSIGNMENT DASHBOARD
// ----------------------------------------------------
async function loadDashboard() {
  const container = document.getElementById("assignmentsList");
  container.innerHTML = '<div style="text-align:center; padding: 2rem;">Loading assignments...</div>';

  const token = localStorage.getItem("campus_access_token");
  if (!token) {
    container.innerHTML = `
      <div style="text-align:center; padding: 3rem; background: white; border-radius: 8px; border: 1px solid var(--neutral-200);">
        <h3>Welcome to Campus Super App Academic Portal</h3>
        <p style="color: var(--neutral-600); margin: 0.5rem 0 1.5rem;">Please log in with your Campus ID to view your enrolled courses and assignments.</p>
        <button class="btn btn-primary" onclick="document.getElementById('authModal').classList.remove('hidden')">Log In Now</button>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch("/api/v1/assignments/dashboard/student", {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success) {
      container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--danger);">${result.error}</div>`;
      return;
    }

    const { summary, categories } = result.data;

    // Update Metrics
    document.getElementById("metricTotal").innerText = summary.total;
    document.getElementById("metricUpcoming").innerText = summary.upcoming;
    document.getElementById("metricSubmitted").innerText = summary.submitted;
    document.getElementById("metricOverdue").innerText = summary.overdue;
    document.getElementById("metricGraded").innerText = summary.graded;

    // Filters
    const statusFilter = document.getElementById("statusFilter").value;
    const typeFilter = document.getElementById("typeFilter").value;

    let items = [];
    if (statusFilter === "ALL") {
      items = [
        ...categories.upcoming,
        ...categories.submitted,
        ...categories.overdue,
        ...categories.graded,
      ];
    } else {
      items = categories[statusFilter.toLowerCase()] || [];
    }

    if (typeFilter !== "ALL") {
      items = items.filter((a) => a.type === typeFilter);
    }

    if (items.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--neutral-600); background: white; border-radius: 8px;">No assignments found for the selected criteria.</div>`;
      return;
    }

    container.innerHTML = items.map((a) => renderAssignmentCard(a)).join("");
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--danger);">${err.message}</div>`;
  }
}

function renderAssignmentCard(a) {
  const badgeClass =
    a.status === "GRADED"
      ? "badge-graded"
      : a.status === "SUBMITTED"
      ? "badge-submitted"
      : a.status === "LATE_SUBMITTED"
      ? "badge-late"
      : a.status === "OVERDUE"
      ? "badge-overdue"
      : "badge-upcoming";

  const isGroup = a.type === "GROUP";

  return `
    <div class="assignment-card">
      <div class="card-header">
        <div>
          <div class="course-tag">${a.courseCode} — ${a.courseName}</div>
          <h3 class="card-title">${a.title}</h3>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          ${isGroup ? '<span class="badge badge-group">👥 Group Assignment</span>' : ""}
          <span class="badge ${badgeClass}">${a.status.replace("_", " ")}</span>
        </div>
      </div>

      <p style="color: var(--neutral-600); font-size: 0.95rem; margin-bottom: 1rem;">${a.description}</p>

      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; font-size: 0.85rem;">
        <div class="countdown-box">
          ⏰ ${a.timeRemainingText} (Due: ${new Date(a.dueDate).toLocaleDateString()})
        </div>
        ${a.maxMarks ? `<div><strong>Marks:</strong> ${a.maxMarks} pts</div>` : ""}
        ${
          a.submission && a.submission.grade !== null
            ? `<div style="color: var(--success); font-weight: 700;">Score: ${a.submission.grade}/${a.maxMarks} pts</div>`
            : ""
        }
      </div>

      ${
        a.submission && a.submission.feedback
          ? `<div style="margin-top: 0.75rem; background: #faf5ff; border-left: 3px solid #8b5cf6; padding: 0.5rem 0.75rem; font-size: 0.85rem;">
              <strong>Teacher Feedback:</strong> ${a.submission.feedback}
             </div>`
          : ""
      }

      <div class="card-footer">
        <div>
          ${
            a.submission
              ? `<span style="font-size: 0.85rem; color: var(--neutral-600);">Submitted v${a.submission.version} on ${new Date(a.submission.submittedAt).toLocaleDateString()}</span>`
              : `<span style="font-size: 0.85rem; color: var(--neutral-600);">Not submitted yet</span>`
          }
        </div>
        <button class="btn btn-primary btn-sm" onclick="openSubmissionModal('${a.id}')">
          ${a.submission ? "View / Resubmit" : "Submit Work"}
        </button>
      </div>
    </div>
  `;
}

document.getElementById("statusFilter").addEventListener("change", loadDashboard);
document.getElementById("typeFilter").addEventListener("change", loadDashboard);
document.getElementById("refreshDashboardBtn").addEventListener("click", loadDashboard);

// ----------------------------------------------------
// 2. SUBMISSION MODAL & DRAG-AND-DROP
// ----------------------------------------------------
async function openSubmissionModal(assignmentId) {
  selectedFile = null;
  document.getElementById("selectedFileName").style.display = "none";
  document.getElementById("submitFileBtn").disabled = true;

  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    activeAssignment = result.data;
    document.getElementById("subModalTitle").innerText = activeAssignment.title;

    let attachHtml = "";
    if (activeAssignment.attachments && activeAssignment.attachments.length > 0) {
      attachHtml = `
        <div style="margin-top: 0.5rem;">
          <strong>Attachments:</strong>
          <ul style="margin-left: 1.25rem; font-size: 0.85rem;">
            ${activeAssignment.attachments
              .map(
                (att) =>
                  `<li><a href="/api/v1/assignments/files/download?fileKey=${encodeURIComponent(
                    att.fileKey
                  )}" target="_blank">${att.fileName}</a> (${Math.round(
                    att.fileSize / 1024
                  )} KB)</li>`
              )
              .join("")}
          </ul>
        </div>
      `;
    }

    document.getElementById("subModalDetails").innerHTML = `
      <p style="font-size: 0.9rem; color: var(--neutral-600);">${activeAssignment.description}</p>
      ${
        activeAssignment.instructions
          ? `<p style="font-size: 0.85rem; margin-top: 0.5rem; background: var(--neutral-100); padding: 0.5rem; border-radius: 4px;"><strong>Instructions:</strong> ${activeAssignment.instructions}</p>`
          : ""
      }
      ${attachHtml}
    `;

    // Load submission history
    loadSubmissionHistory(assignmentId);

    document.getElementById("submissionModal").classList.remove("hidden");
  } catch (err) {
    alert(err.message);
  }
}

async function loadSubmissionHistory(assignmentId) {
  const container = document.getElementById("versionHistoryTable");
  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}/submissions/my`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = `<p style="color: var(--neutral-600); font-size: 0.85rem; margin-top: 0.5rem;">No submissions recorded yet.</p>`;
      return;
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>File</th>
            <th>Date</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${result.data
            .map(
              (sub) => `
            <tr>
              <td><strong>v${sub.version}</strong> ${sub.isCurrentVersion ? "🌟 (Current)" : ""}</td>
              <td>${sub.fileName}</td>
              <td>${new Date(sub.submittedAt).toLocaleString()}</td>
              <td><span class="badge ${sub.status === "GRADED" ? "badge-graded" : "badge-submitted"}">${sub.status}</span></td>
              <td>
                <a href="/api/v1/assignments/files/download?fileKey=${encodeURIComponent(sub.fileKey)}" class="btn btn-secondary btn-sm">Download</a>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--danger); font-size: 0.85rem;">Failed to load submission history.</p>`;
  }
}

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("submissionFileInput");

dropZone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFileSelected(e.target.files[0]);
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) {
    handleFileSelected(e.dataTransfer.files[0]);
  }
});

function handleFileSelected(file) {
  if (file.size > 50 * 1024 * 1024) {
    alert("File size exceeds 50MB limit.");
    return;
  }
  selectedFile = file;
  const label = document.getElementById("selectedFileName");
  label.innerText = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  label.style.display = "block";
  document.getElementById("submitFileBtn").disabled = false;
}

document.getElementById("submitFileBtn").addEventListener("click", async () => {
  if (!activeAssignment || !selectedFile) return;

  const formData = new FormData();
  formData.append("file", selectedFile);

  const btn = document.getElementById("submitFileBtn");
  btn.disabled = true;
  btn.innerText = "Uploading & Validating...";

  try {
    const res = await fetch(`/api/v1/assignments/${activeAssignment.id}/submit`, {
      method: "POST",
      headers: getAuthHeader(),
      body: formData,
    });
    const result = await res.json();

    if (!result.success) {
      alert(`Submission Error: ${result.error}`);
    } else {
      alert("✅ Assignment submitted successfully!");
      loadSubmissionHistory(activeAssignment.id);
      loadDashboard();
      selectedFile = null;
      document.getElementById("selectedFileName").style.display = "none";
    }
  } catch (err) {
    alert(`Upload failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerText = "🚀 Confirm & Upload Submission";
  }
});

// ----------------------------------------------------
// 3. GROUP COLLABORATION
// ----------------------------------------------------
async function loadGroupAssignmentsDropdown() {
  const select = document.getElementById("groupAssignmentSelect");
  select.innerHTML = '<option value="">Select an assignment...</option>';

  try {
    const res = await fetch("/api/v1/assignments/dashboard/student", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const all = [
      ...result.data.categories.upcoming,
      ...result.data.categories.submitted,
      ...result.data.categories.overdue,
      ...result.data.categories.graded,
    ];

    const groupAssignments = all.filter((a) => a.type === "GROUP");
    select.innerHTML =
      '<option value="">Select a group assignment...</option>' +
      groupAssignments.map((a) => `<option value="${a.id}">${a.courseCode} — ${a.title}</option>`).join("");
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("groupAssignmentSelect").addEventListener("change", async (e) => {
  const assignmentId = e.target.value;
  if (!assignmentId) return;

  const container = document.getElementById("groupsList");
  container.innerHTML = '<div style="text-align:center; padding: 2rem;">Loading groups...</div>';

  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}/groups`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    if (result.data.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; background: white; border-radius: 8px;">No groups created yet. Be the first to start a team!</div>`;
      return;
    }

    container.innerHTML = result.data
      .map(
        (g) => `
        <div class="assignment-card" style="margin-bottom: 1rem;">
          <div class="card-header">
            <div>
              <h3 class="card-title">${g.name}</h3>
              <p style="font-size: 0.85rem; color: var(--neutral-600);">${g.members.length} Members</p>
            </div>
            <div>
              ${g.isLocked ? '<span class="badge badge-overdue">🔒 Locked (Submitted)</span>' : '<span class="badge badge-submitted">Open</span>'}
            </div>
          </div>
          <div style="font-size: 0.85rem; margin: 0.5rem 0;">
            <strong>Members:</strong> ${g.members.map((m) => `${m.user.fullName} ${m.isLeader ? "(Leader)" : ""}`).join(", ")}
          </div>
          <div style="margin-top: 0.75rem;">
            ${!g.isLocked ? `<button class="btn btn-secondary btn-sm" onclick="joinGroup('${assignmentId}', '${g.id}')">Join Team</button>` : ""}
          </div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger);">${err.message}</div>`;
  }
});

async function joinGroup(assignmentId, groupId) {
  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}/groups/${groupId}/join`, {
      method: "POST",
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);
    alert("Joined group successfully!");
    document.getElementById("groupAssignmentSelect").dispatchEvent(new Event("change"));
  } catch (err) {
    alert(err.message);
  }
}

// ----------------------------------------------------
// 4. TEACHER MANAGEMENT & GRADING
// ----------------------------------------------------
async function loadTeacherOfferings() {
  const select = document.getElementById("teacherOfferingSelect");
  try {
    const res = await fetch("/api/v1/academic/my-courses", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const offerings = result.data.instructedOfferings || [];
    select.innerHTML =
      '<option value="">Select course offering...</option>' +
      offerings
        .map((o) => `<option value="${o.id}">${o.course.code} — ${o.course.title} (${o.class.name})</option>`)
        .join("");
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("teacherOfferingSelect").addEventListener("change", async (e) => {
  const offeringId = e.target.value;
  if (!offeringId) return;

  const container = document.getElementById("submissionsTableContainer");
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading submissions...</div>';

  try {
    const res = await fetch(`/api/v1/assignments/offering/${offeringId}`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success || result.data.length === 0) {
      container.innerHTML = '<p style="color: var(--neutral-600);">No assignments found for this course offering.</p>';
      return;
    }

    const assignment = result.data[0];
    const subRes = await fetch(`/api/v1/assignments/${assignment.id}/submissions`, {
      headers: getAuthHeader(),
    });
    const subResult = await subRes.json();

    if (!subResult.success || subResult.data.length === 0) {
      container.innerHTML = `<p style="color: var(--neutral-600);">No student submissions received yet for "${assignment.title}".</p>`;
      return;
    }

    container.innerHTML = `
      <h4>Submissions for: ${assignment.title} (Max Marks: ${assignment.maxMarks || "N/A"})</h4>
      <table>
        <thead>
          <tr>
            <th>Student / Team</th>
            <th>File</th>
            <th>Submitted At</th>
            <th>Status</th>
            <th>Score</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${subResult.data
            .map((sub) => {
              const name = sub.student ? sub.student.fullName : sub.group ? sub.group.name : "Unknown";
              return `
              <tr>
                <td><strong>${name}</strong></td>
                <td><a href="/api/v1/assignments/files/download?fileKey=${encodeURIComponent(sub.fileKey)}">${sub.fileName}</a></td>
                <td>${new Date(sub.submittedAt).toLocaleString()}</td>
                <td><span class="badge ${sub.status === "GRADED" ? "badge-graded" : "badge-submitted"}">${sub.status}</span></td>
                <td>${sub.grade !== null ? `${sub.grade} pts` : "—"}</td>
                <td>
                  <button class="btn btn-primary btn-sm" onclick="openGradeModal('${sub.id}', '${assignment.id}', '${name}', ${assignment.maxMarks || 100}, ${sub.grade || 'null'})">
                    Grade
                  </button>
                </td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger);">${err.message}</div>`;
  }
});

function openGradeModal(submissionId, assignmentId, studentName, maxMarks, currentGrade) {
  document.getElementById("gradeSubmissionId").value = submissionId;
  document.getElementById("gradeAssignmentId").value = assignmentId;
  document.getElementById("gradeScoreInput").value = currentGrade !== null ? currentGrade : "";
  document.getElementById("gradeScoreInput").max = maxMarks;
  document.getElementById("gradeModalDetails").innerHTML = `
    <p><strong>Grading submission for:</strong> ${studentName}</p>
    <p style="font-size: 0.85rem; color: var(--neutral-600);">Maximum allowed marks: ${maxMarks} points</p>
  `;
  document.getElementById("gradeModal").classList.remove("hidden");
}

document.getElementById("gradeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submissionId = document.getElementById("gradeSubmissionId").value;
  const assignmentId = document.getElementById("gradeAssignmentId").value;
  const score = document.getElementById("gradeScoreInput").value;
  const feedback = document.getElementById("gradeFeedbackInput").value;

  try {
    const res = await fetch(`/api/v1/assignments/${assignmentId}/submissions/${submissionId}/grade`, {
      method: "PATCH",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ grade: parseFloat(score), feedback }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    alert("✅ Grade recorded and student notified!");
    closeModal("gradeModal");
    document.getElementById("teacherOfferingSelect").dispatchEvent(new Event("change"));
  } catch (err) {
    alert(err.message);
  }
});

// ----------------------------------------------------
// 5. NOTIFICATIONS
// ----------------------------------------------------
async function loadNotifications() {
  try {
    const res = await fetch("/api/v1/notifications", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const badge = document.getElementById("notifBadge");
    const count = result.data.unreadCount;
    if (count > 0) {
      badge.innerText = count;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }

    const list = document.getElementById("notifList");
    if (result.data.notifications.length === 0) {
      list.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--neutral-600);">No notifications</div>';
      return;
    }

    list.innerHTML = result.data.notifications
      .map(
        (n) => `
        <div class="notification-item ${n.isRead ? "" : "unread"}" onclick="markNotificationRead('${n.id}')">
          <div style="font-weight: 600; color: var(--neutral-900);">${n.title}</div>
          <div style="color: var(--neutral-600); margin-top: 0.2rem;">${n.message}</div>
          <div style="font-size: 0.75rem; color: var(--neutral-600); margin-top: 0.3rem;">${new Date(n.createdAt).toLocaleTimeString()}</div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    console.error("Failed to load notifications:", err);
  }
}

async function markNotificationRead(id) {
  try {
    await fetch(`/api/v1/notifications/${id}/read`, {
      method: "PATCH",
      headers: getAuthHeader(),
    });
    loadNotifications();
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("markAllReadBtn").addEventListener("click", async () => {
  try {
    await fetch("/api/v1/notifications/read-all", {
      method: "PATCH",
      headers: getAuthHeader(),
    });
    loadNotifications();
  } catch (err) {
    console.error(err);
  }
});

// ----------------------------------------------------
// UTILITY / MODAL HANDLERS
// ----------------------------------------------------
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

document.getElementById("openCreateAssignmentModalBtn")?.addEventListener("click", () => {
  document.getElementById("createAssignmentModal").classList.remove("hidden");
});

document.getElementById("openCreateGroupBtn")?.addEventListener("click", () => {
  document.getElementById("createGroupModal").classList.remove("hidden");
});

// ----------------------------------------------------
// 6. LEARNING MATERIALS & ACADEMIC RESOURCES
// ----------------------------------------------------
async function loadMaterials() {
  const container = document.getElementById("materialsList");
  container.innerHTML = '<div style="text-align:center; padding: 2rem;">Loading academic resources...</div>';

  const category = document.getElementById("materialsCategoryFilter")?.value || "";
  const courseOfferingId = document.getElementById("materialsOfferingFilter")?.value || "";
  const search = document.getElementById("materialsSearchInput")?.value?.trim() || "";
  const sortBy = document.getElementById("materialsSortBy")?.value || "newest";

  const params = new URLSearchParams();
  if (category) params.append("category", category);
  if (courseOfferingId) params.append("courseOfferingId", courseOfferingId);
  if (search) params.append("search", search);
  if (sortBy) params.append("sortBy", sortBy);

  try {
    const res = await fetch(`/api/v1/materials?${params.toString()}`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success) {
      container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--danger);">${result.error}</div>`;
      return;
    }

    const { materials, pagination } = result.data;

    if (materials.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 3rem; background: white; border-radius: 8px; color: var(--neutral-600);">No academic resources found matching your search.</div>`;
      return;
    }

    container.innerHTML = materials.map((m) => renderMaterialCard(m)).join("");

    // Check if user has teacher/admin rights to show moderation queue
    checkAndLoadModerationQueue();
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--danger);">${err.message}</div>`;
  }
}

function renderMaterialCard(m) {
  const sizeMb = (m.fileSize / (1024 * 1024)).toFixed(2);
  const sizeKb = Math.round(m.fileSize / 1024);
  const sizeStr = m.fileSize >= 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

  const categoryLabel = m.category.replace(/_/g, " ");

  const isPending = m.status === "PENDING";
  const isRejected = m.status === "REJECTED";

  return `
    <div class="assignment-card" style="margin-bottom: 1rem;">
      <div class="card-header">
        <div>
          <div class="course-tag">${m.courseOffering?.course?.code || "COURSE"} — ${m.courseOffering?.course?.title || "Academic Course"}</div>
          <h3 class="card-title">${m.title}</h3>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span class="badge" style="background: #e0e7ff; color: #3730a3;">📂 ${categoryLabel}</span>
          ${isPending ? '<span class="badge badge-late">⏳ Pending Review</span>' : ""}
          ${isRejected ? '<span class="badge badge-overdue">❌ Rejected</span>' : ""}
        </div>
      </div>

      ${m.description ? `<p style="font-size: 0.9rem; color: var(--neutral-600); margin-bottom: 0.75rem;">${m.description}</p>` : ""}

      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; font-size: 0.85rem; color: var(--neutral-600);">
        <div>📄 <strong>File:</strong> ${m.fileName} (${sizeStr})</div>
        <div>👤 <strong>Uploaded By:</strong> ${m.uploader?.fullName || "Faculty"}</div>
        <div>📥 <strong>Downloads:</strong> ${m.downloads}</div>
        <div>📅 <strong>Date:</strong> ${new Date(m.createdAt).toLocaleDateString()}</div>
      </div>

      ${m.tags ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--accent);">🏷️ Tags: ${m.tags}</div>` : ""}

      <div class="card-footer">
        <div>
          ${m.moderationNote ? `<span style="font-size: 0.8rem; color: #b45309;">Note: ${m.moderationNote}</span>` : ""}
        </div>
        <div>
          <a href="/api/v1/materials/${m.id}/download" class="btn btn-primary btn-sm" download target="_blank">
            📥 Download Resource
          </a>
        </div>
      </div>
    </div>
  `;
}

async function loadMaterialsStats() {
  try {
    const res = await fetch("/api/v1/materials/stats", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    document.getElementById("metricMaterialsTotal").innerText = result.data.totalResources;
    document.getElementById("metricMaterialsDownloads").innerText = result.data.totalDownloads;
  } catch (err) {
    console.error("Failed to load materials stats:", err);
  }
}

async function loadMaterialsOfferings() {
  const selectFilter = document.getElementById("materialsOfferingFilter");
  const selectUpload = document.getElementById("matCourseOfferingSelect");

  try {
    const res = await fetch("/api/v1/academic/my-courses", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const allOfferings = [
      ...(result.data.enrolledOfferings || []),
      ...(result.data.instructedOfferings || []),
    ];

    // Deduplicate offerings by id
    const unique = Array.from(new Map(allOfferings.map((o) => [o.id, o])).values());

    const optionsHtml = unique
      .map((o) => `<option value="${o.id}">${o.course.code} — ${o.course.title} (${o.class.name})</option>`)
      .join("");

    if (selectFilter) {
      selectFilter.innerHTML = '<option value="">All Enrolled Courses</option>' + optionsHtml;
    }
    if (selectUpload) {
      selectUpload.innerHTML = '<option value="">Select course offering...</option>' + optionsHtml;
    }
  } catch (err) {
    console.error("Failed to load course offerings:", err);
  }
}

async function checkAndLoadModerationQueue() {
  const section = document.getElementById("materialsModerationSection");
  const list = document.getElementById("pendingModerationList");
  const badge = document.getElementById("pendingModerationBadge");

  try {
    const res = await fetch("/api/v1/materials/moderation/queue", {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    badge.innerText = `${result.data.length} Pending`;

    list.innerHTML = result.data
      .map(
        (item) => `
        <div style="background: white; border-radius: 6px; padding: 0.75rem 1rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <strong>${item.title}</strong> (${item.fileName})
            <div style="font-size: 0.8rem; color: var(--neutral-600);">
              Course: ${item.courseOffering.course.title} | Uploader: ${item.uploader.fullName} | Cat: ${item.category}
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-success btn-sm" onclick="openModerateModal('${item.id}', '${item.title.replace(/'/g, "\\'")}', 'APPROVED')">
              ✅ Approve
            </button>
            <button class="btn btn-danger btn-sm" onclick="openModerateModal('${item.id}', '${item.title.replace(/'/g, "\\'")}', 'REJECTED')">
              ❌ Reject
            </button>
          </div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    section.classList.add("hidden");
  }
}

function openModerateModal(materialId, title, defaultAction) {
  document.getElementById("modMaterialId").value = materialId;
  document.getElementById("modActionSelect").value = defaultAction;
  document.getElementById("modMaterialDetails").innerHTML = `
    <p><strong>Reviewing Resource:</strong> ${title}</p>
  `;
  document.getElementById("moderateMaterialModal").classList.remove("hidden");
}

document.getElementById("moderateMaterialForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const materialId = document.getElementById("modMaterialId").value;
  const status = document.getElementById("modActionSelect").value;
  const note = document.getElementById("modNoteInput").value;

  try {
    const res = await fetch(`/api/v1/materials/${materialId}/moderate`, {
      method: "PATCH",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    const result = await res.json();

    if (!result.success) return alert(result.error);

    alert(`✅ Resource status updated to: ${status}`);
    closeModal("moderateMaterialModal");
    loadMaterials();
    loadMaterialsStats();
  } catch (err) {
    alert(err.message);
  }
});

// Upload Material Form Handler
document.getElementById("openUploadMaterialModalBtn")?.addEventListener("click", () => {
  loadMaterialsOfferings();
  document.getElementById("uploadMaterialModal").classList.remove("hidden");
});

document.getElementById("uploadMaterialForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("matFileInput");
  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Please select a file to upload.");
    return;
  }

  const formData = new FormData();
  formData.append("title", document.getElementById("matTitle").value.trim());
  formData.append("description", document.getElementById("matDescription").value.trim());
  formData.append("category", document.getElementById("matCategory").value);
  formData.append("courseOfferingId", document.getElementById("matCourseOfferingSelect").value);
  formData.append("tags", document.getElementById("matTags").value.trim());
  formData.append("file", fileInput.files[0]);

  const submitBtn = document.getElementById("uploadMaterialSubmitBtn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Uploading & Hashing...";

  try {
    const res = await fetch("/api/v1/materials", {
      method: "POST",
      headers: getAuthHeader(),
      body: formData,
    });
    const result = await res.json();

    if (!result.success) {
      alert(`Upload Error: ${result.error}`);
    } else {
      const isApproved = result.data.status === "APPROVED";
      alert(isApproved ? "✅ Resource published directly!" : "ℹ️ Resource submitted for faculty moderation!");
      closeModal("uploadMaterialModal");
      document.getElementById("uploadMaterialForm").reset();
      loadMaterials();
      loadMaterialsStats();
    }
  } catch (err) {
    alert(`Upload failed: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "🚀 Publish Resource";
  }
});

// Materials Filter Listeners
document.getElementById("materialsCategoryFilter")?.addEventListener("change", loadMaterials);
document.getElementById("materialsOfferingFilter")?.addEventListener("change", loadMaterials);
document.getElementById("materialsSortBy")?.addEventListener("change", loadMaterials);
document.getElementById("refreshMaterialsBtn")?.addEventListener("click", () => {
  loadMaterials();
  loadMaterialsStats();
});
document.getElementById("materialsSearchInput")?.addEventListener("keyup", (e) => {
  if (e.key === "Enter") loadMaterials();
});

// Archive Filter Listeners
// ----------------------------------------------------
// 6. ACADEMIC ARCHIVE & PAST EXAMS
// ----------------------------------------------------
let activeArchiveType = "";

document.querySelectorAll(".archive-type-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".archive-type-pill").forEach((p) => {
      p.classList.remove("active");
      p.classList.add("btn-secondary");
    });
    pill.classList.add("active");
    pill.classList.remove("btn-secondary");
    activeArchiveType = pill.dataset.type || "";
    loadArchive();
  });
});

async function loadArchiveOfferings() {
  const selectFilter = document.getElementById("archiveOfferingFilter");
  const selectUpload = document.getElementById("arcCourseOfferingSelect");
  try {
    const res = await fetch("/api/v1/academic/my-courses", {
      headers: getAuthHeader(),
    });
    const result = await res.json();
    if (!result.success) return;

    const allOfferings = [
      ...(result.data.enrolledOfferings || []),
      ...(result.data.instructedOfferings || []),
    ];
    const unique = Array.from(new Map(allOfferings.map((o) => [o.id, o])).values());
    const optionsHtml = unique
      .map((o) => `<option value="${o.id}">${o.course.code} — ${o.course.title} (${o.class.name})</option>`)
      .join("");

    if (selectFilter) {
      selectFilter.innerHTML = '<option value="">All Courses</option>' + optionsHtml;
    }
    if (selectUpload) {
      selectUpload.innerHTML = '<option value="">Select course offering...</option>' + optionsHtml;
    }
  } catch (err) {
    console.error("Failed to load archive course offerings:", err);
  }
}

async function loadArchiveStats() {
  try {
    await fetch("/api/v1/archive/stats", { headers: getAuthHeader() });
  } catch (err) {
    console.error("Archive stats error:", err);
  }
}

async function checkAndLoadArchiveModerationQueue() {
  const section = document.getElementById("archiveModerationSection");
  const list = document.getElementById("archivePendingList");
  const badge = document.getElementById("archivePendingBadge");

  try {
    const res = await fetch("/api/v1/archive/moderation/queue", {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    badge.innerText = `${result.data.length} Pending`;

    list.innerHTML = result.data
      .map(
        (item) => `
        <div style="background: white; border-radius: 6px; padding: 0.75rem 1rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <strong>${item.title}</strong> (${item.fileName})
            <div style="font-size: 0.8rem; color: var(--neutral-600);">
              Course: ${item.courseOffering.course.code} | Type: ${item.resourceType}${item.assessmentType ? ` [${item.assessmentType}]` : ""} | Year: ${item.examYear || "N/A"} | Uploader: ${item.uploader.fullName}
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-success btn-sm" onclick="openModerateArchiveModal('${item.id}', '${item.title.replace(/'/g, "\\'")}', 'APPROVE')">
              ✅ Review & Approve
            </button>
            <button class="btn btn-danger btn-sm" onclick="openModerateArchiveModal('${item.id}', '${item.title.replace(/'/g, "\\'")}', 'REJECT')">
              ❌ Reject
            </button>
          </div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    section.classList.add("hidden");
  }
}

async function loadArchive() {
  const container = document.getElementById("archiveList");
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading academic archive...</div>';

  checkAndLoadArchiveModerationQueue();

  const search = document.getElementById("archiveSearchInput")?.value.trim() || "";
  const assessmentType = document.getElementById("archiveAssessmentFilter")?.value || "";
  const examYear = document.getElementById("archiveYearFilter")?.value || "";
  const isOfficial = document.getElementById("archiveOfficialFilter")?.value || "";
  const courseOfferingId = document.getElementById("archiveOfferingFilter")?.value || "";
  const sortBy = document.getElementById("archiveSortBy")?.value || "newest";

  const params = new URLSearchParams();
  if (activeArchiveType) params.append("resourceType", activeArchiveType);
  if (assessmentType) params.append("assessmentType", assessmentType);
  if (examYear) params.append("examYear", examYear);
  if (isOfficial) params.append("isOfficial", isOfficial);
  if (courseOfferingId) params.append("courseOfferingId", courseOfferingId);
  if (sortBy) params.append("sortBy", sortBy);
  if (search) params.append("search", search);

  try {
    const res = await fetch(`/api/v1/archive?${params.toString()}`, {
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success || !result.data.resources || result.data.resources.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; background: white; border-radius: 8px; border: 1px solid var(--neutral-200);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🏛️</div>
          <h3>No Academic Archive Materials Found</h3>
          <p style="color: var(--neutral-600); margin-top: 0.5rem;">
            ${search ? `No results matching "${search}".` : "Be the first to contribute past exams, solutions, or project archives."}
          </p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="document.getElementById('openUploadArchiveBtn').click()">
            ➕ Contribute Past Paper or Project
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = result.data.resources.map(renderArchiveCard).join("");
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 2rem;">${err.message}</div>`;
  }
}

function renderArchiveCard(a) {
  const sizeMb = (a.fileSize / (1024 * 1024)).toFixed(2);
  const sizeKb = Math.round(a.fileSize / 1024);
  const sizeStr = a.fileSize >= 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

  const isPending = a.status === "PENDING";
  const isRejected = a.status === "REJECTED";

  const officialBadge = a.isOfficial
    ? '<span class="badge" style="background: #fef08a; color: #854d0e; font-weight: 700;">⭐ Official Solution</span>'
    : '<span class="badge" style="background: #f1f5f9; color: #475569;">👤 Student Reference</span>';

  const typeIcon = a.resourceType === "PAST_EXAM" ? "📝" : a.resourceType === "PROJECT" ? "💻" : a.resourceType === "SOLUTION" ? "💡" : "📚";

  return `
    <div class="assignment-card" style="margin-bottom: 1rem;">
      <div class="card-header">
        <div>
          <div class="course-tag">${a.courseOffering?.course?.code || "COURSE"} — ${a.courseOffering?.course?.title || "Course"}</div>
          <h3 class="card-title">${typeIcon} ${a.title}</h3>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          ${officialBadge}
          ${a.examYear ? `<span class="badge" style="background: #e2e8f0; color: #1e293b;">📅 ${a.examYear}</span>` : ""}
          ${a.assessmentType ? `<span class="badge" style="background: #ede9fe; color: #5b21b6;">${a.assessmentType}</span>` : ""}
          ${isPending ? '<span class="badge badge-late">⏳ Pending Review</span>' : ""}
          ${isRejected ? '<span class="badge badge-overdue">❌ Rejected</span>' : ""}
        </div>
      </div>

      ${a.description ? `<p style="font-size: 0.9rem; color: var(--neutral-600); margin-bottom: 0.75rem;">${a.description}</p>` : ""}

      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; font-size: 0.85rem; color: var(--neutral-600);">
        <div>💾 <strong>File:</strong> ${a.fileName} (${sizeStr})</div>
        <div>👤 <strong>Uploaded By:</strong> ${a.uploader?.fullName || "Contributor"}</div>
        <div>📥 <strong>Downloads:</strong> ${a.downloads}</div>
        <div>🗓️ <strong>Academic Year:</strong> ${a.academicYearStr || "N/A"} (Semester ${a.semesterNum || 1})</div>
      </div>

      ${a.tags ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--accent);">🏷️ Tags: ${a.tags}</div>` : ""}

      <div class="card-footer">
        <div>
          ${a.moderationNote ? `<span style="font-size: 0.8rem; color: #b45309;">Note: ${a.moderationNote}</span>` : ""}
        </div>
        <div>
          <a href="/api/v1/archive/${a.id}/download" class="btn btn-primary btn-sm" download target="_blank">
            📥 Download Archive File
          </a>
        </div>
      </div>
    </div>
  `;
}

function openModerateArchiveModal(resourceId, title, defaultAction) {
  document.getElementById("modArchiveId").value = resourceId;
  document.getElementById("modArchiveDecision").value = defaultAction;
  document.getElementById("modArchiveDetails").innerHTML = `
    <p><strong>Reviewing Archive Submission:</strong> ${title}</p>
  `;
  document.getElementById("moderateArchiveModal").classList.remove("hidden");
}

document.getElementById("moderateArchiveForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const resourceId = document.getElementById("modArchiveId").value;
  const action = document.getElementById("modArchiveDecision").value;
  const isOfficial = document.getElementById("modArchiveIsOfficial").checked;
  const note = document.getElementById("modArchiveNote").value;

  try {
    const res = await fetch(`/api/v1/archive/${resourceId}/moderate`, {
      method: "PATCH",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, isOfficial }),
    });
    const result = await res.json();

    if (!result.success) return alert(result.error);

    alert(`✅ Archive resource ${action.toLowerCase()}d successfully!`);
    closeModal("moderateArchiveModal");
    loadArchive();
    loadArchiveStats();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("openUploadArchiveBtn")?.addEventListener("click", () => {
  loadArchiveOfferings();
  document.getElementById("uploadArchiveModal").classList.remove("hidden");
});

document.getElementById("uploadArchiveForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("arcFileInput");
  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Please select a past exam, project, or solution file to upload.");
    return;
  }

  const formData = new FormData();
  formData.append("title", document.getElementById("arcTitle").value.trim());
  formData.append("description", document.getElementById("arcDescription").value.trim());
  formData.append("resourceType", document.getElementById("arcResourceTypeSelect").value);
  formData.append("assessmentType", document.getElementById("arcAssessmentTypeSelect").value);
  formData.append("courseOfferingId", document.getElementById("arcCourseOfferingSelect").value);
  const examYear = document.getElementById("arcExamYear").value;
  if (examYear) formData.append("examYear", examYear);
  formData.append("isOfficial", document.getElementById("arcIsOfficial").checked);
  formData.append("tags", document.getElementById("arcTags").value.trim());
  formData.append("file", fileInput.files[0]);

  const submitBtn = document.getElementById("uploadArchiveSubmitBtn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Uploading & Archiving...";

  try {
    const res = await fetch("/api/v1/archive", {
      method: "POST",
      headers: getAuthHeader(),
      body: formData,
    });
    const result = await res.json();

    if (!result.success) {
      alert(`Archive Error: ${result.error}`);
    } else {
      const isApproved = result.data.status === "APPROVED";
      alert(isApproved ? "✅ Archived resource published directly!" : "ℹ️ Resource submitted for faculty review!");
      closeModal("uploadArchiveModal");
      document.getElementById("uploadArchiveForm").reset();
      loadArchive();
      loadArchiveStats();
    }
  } catch (err) {
    alert(`Upload failed: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "🚀 Submit to Archive";
  }
});

document.getElementById("archiveAssessmentFilter")?.addEventListener("change", loadArchive);
document.getElementById("archiveYearFilter")?.addEventListener("change", loadArchive);
document.getElementById("archiveOfficialFilter")?.addEventListener("change", loadArchive);
document.getElementById("archiveOfferingFilter")?.addEventListener("change", loadArchive);
document.getElementById("archiveSortBy")?.addEventListener("change", loadArchive);
document.getElementById("refreshArchiveBtn")?.addEventListener("click", () => {
  loadArchive();
  loadArchiveStats();
});
document.getElementById("archiveSearchInput")?.addEventListener("keyup", (e) => {
  if (e.key === "Enter") loadArchive();
});

// ----------------------------------------------------
// 7. PRACTICE QUESTIONS & QUIZZES (PHASE 6)
// ----------------------------------------------------
let activeQuizSubView = "quizzes";
let activeQuizData = null;
let activeQuizQuestionIndex = 0;
let activeQuizAnswers = {};
let quizTimerInterval = null;

// Sub-view toggle
document.querySelectorAll(".quiz-view-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".quiz-view-pill").forEach((p) => {
      p.classList.remove("active");
      p.classList.add("btn-secondary");
    });
    pill.classList.add("active");
    pill.classList.remove("btn-secondary");

    activeQuizSubView = pill.dataset.view;
    if (activeQuizSubView === "quizzes") {
      document.getElementById("quizzesContainer").classList.remove("hidden");
      document.getElementById("practiceContainer").classList.add("hidden");
      document.getElementById("practiceFilterGroup").style.display = "none";
      loadQuizzes();
    } else {
      document.getElementById("quizzesContainer").classList.add("hidden");
      document.getElementById("practiceContainer").classList.remove("hidden");
      document.getElementById("practiceFilterGroup").style.display = "block";
      loadPracticeQuestions();
    }
  });
});

async function loadQuizzesOfferings() {
  const selectFilter = document.getElementById("quizzesOfferingFilter");
  const selectQ = document.getElementById("qCourseOfferingSelect");
  const selectQuiz = document.getElementById("quizCourseOfferingSelect");

  try {
    const res = await fetch("/api/v1/academic/my-courses", { headers: getAuthHeader() });
    const result = await res.json();
    if (!result.success) return;

    const allOfferings = [
      ...(result.data.enrolledOfferings || []),
      ...(result.data.instructedOfferings || []),
    ];
    const unique = Array.from(new Map(allOfferings.map((o) => [o.id, o])).values());
    const optionsHtml = unique
      .map((o) => `<option value="${o.id}">${o.course.code} — ${o.course.title} (${o.class.name})</option>`)
      .join("");

    if (selectFilter) {
      selectFilter.innerHTML = '<option value="">All Enrolled Courses</option>' + optionsHtml;
    }
    if (selectQ) {
      selectQ.innerHTML = '<option value="">Select course offering...</option>' + optionsHtml;
    }
    if (selectQuiz) {
      selectQuiz.innerHTML = '<option value="">Select course offering...</option>' + optionsHtml;
    }
  } catch (err) {
    console.error("Failed to load quiz course offerings:", err);
  }
}

async function loadQuizzes() {
  const container = document.getElementById("quizzesContainer");
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading course quizzes...</div>';

  const courseOfferingId = document.getElementById("quizzesOfferingFilter")?.value || "";
  const params = new URLSearchParams();
  if (courseOfferingId) params.append("courseOfferingId", courseOfferingId);

  try {
    const res = await fetch(`/api/v1/quizzes?${params.toString()}`, { headers: getAuthHeader() });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; background: white; border-radius: 8px; border: 1px solid var(--neutral-200);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎯</div>
          <h3>No Quizzes Available</h3>
          <p style="color: var(--neutral-600); margin-top: 0.5rem;">There are no active quizzes published for your enrolled courses right now.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = result.data.map(renderQuizCard).join("");
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 2rem;">${err.message}</div>`;
  }
}

function renderQuizCard(q) {
  const isInstructor = currentUser && (currentUser.globalRoles?.includes("ADMIN") || currentUser.role === "INSTRUCTOR");
  const attemptsLeft = Math.max(0, q.maxAttempts - q.userAttemptsCount);
  const bestScoreBadge = q.bestScore !== null
    ? `<span class="badge" style="background: ${q.hasPassed ? "#dcfce7" : "#fee2e2"}; color: ${q.hasPassed ? "#15803d" : "#b91c1c"}; font-weight: 700;">Best: ${Math.round(q.bestScore)}% (${q.hasPassed ? "Passed" : "Not Passed"})</span>`
    : "";

  const publishBadge = q.isPublished
    ? '<span class="badge badge-submitted">✅ Published</span>'
    : '<span class="badge" style="background: #e2e8f0; color: #475569;">Draft</span>';

  return `
    <div class="assignment-card" style="margin-bottom: 1rem;">
      <div class="card-header">
        <div>
          <div class="course-tag">${q.course?.code || "COURSE"} — ${q.course?.title || "Course"}</div>
          <h3 class="card-title">🎯 ${q.title}</h3>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          ${publishBadge}
          ${bestScoreBadge}
          <span class="badge" style="background: #e0e7ff; color: #3730a3;">⏱️ ${q.durationMin} mins</span>
          <span class="badge" style="background: #f1f5f9; color: #334155;">❓ ${q.questionCount} Questions</span>
        </div>
      </div>

      ${q.description ? `<p style="font-size: 0.9rem; color: var(--neutral-600); margin-bottom: 0.75rem;">${q.description}</p>` : ""}

      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; font-size: 0.85rem; color: var(--neutral-600);">
        <div>🎯 <strong>Passing Score:</strong> ${q.passingScore}%</div>
        <div>🔄 <strong>Attempts Used:</strong> ${q.userAttemptsCount} of ${q.maxAttempts}</div>
        <div>🏆 <strong>Total Points:</strong> ${q.totalPoints}</div>
      </div>

      <div class="card-footer" style="margin-top: 1rem;">
        <div style="display: flex; gap: 0.5rem;">
          ${isInstructor ? `
            <button class="btn btn-sm btn-secondary" onclick="openQuizAnalytics('${q.id}')">📊 Cohort Analytics</button>
            <button class="btn btn-sm btn-secondary" onclick="toggleQuizPublish('${q.id}', ${!q.isPublished})">${q.isPublished ? "Unpublish" : "Publish"}</button>
          ` : ""}
        </div>
        <div>
          ${attemptsLeft > 0 || q.hasActiveAttempt ? `
            <button class="btn btn-primary btn-sm" onclick="startQuizRunner('${q.id}')">
              ${q.hasActiveAttempt ? "▶️ Resume Active Quiz" : "🚀 Start Quiz Attempt"}
            </button>
          ` : `
            <button class="btn btn-secondary btn-sm" disabled>Max Attempts Reached</button>
          `}
        </div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// TIMED QUIZ RUNNER ENGINE
// ----------------------------------------------------
async function startQuizRunner(quizId) {
  try {
    const res = await fetch(`/api/v1/quizzes/${quizId}/attempts/start`, {
      method: "POST",
      headers: getAuthHeader(),
    });
    const result = await res.json();

    if (!result.success) return alert(result.error);

    activeQuizData = result.data;
    activeQuizQuestionIndex = 0;
    activeQuizAnswers = {};

    // Restore any previously saved draft answers
    if (activeQuizData.savedAnswers) {
      activeQuizData.savedAnswers.forEach((sa) => {
        activeQuizAnswers[sa.questionId] = {
          selectedOptionId: sa.selectedOptionId,
          textResponse: sa.textResponse,
        };
      });
    }

    document.getElementById("runnerQuizTitle").innerText = "Timed Quiz";
    document.getElementById("runnerQuizInfo").innerText = `Attempt #${activeQuizData.attemptNum} | Time remaining`;

    document.getElementById("takeQuizModal").classList.remove("hidden");

    startQuizTimer(activeQuizData.timeRemainingSeconds);
    renderQuizRunnerQuestion(0);
  } catch (err) {
    alert(`Could not start quiz: ${err.message}`);
  }
}

function startQuizTimer(secondsLeft) {
  if (quizTimerInterval) clearInterval(quizTimerInterval);

  let remaining = secondsLeft;
  const display = document.getElementById("quizCountdown");

  function update() {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    display.innerText = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    if (remaining <= 60) {
      document.getElementById("quizTimerBadge").style.background = "#fee2e2";
      document.getElementById("quizTimerBadge").style.color = "#b91c1c";
    }

    if (remaining <= 0) {
      clearInterval(quizTimerInterval);
      alert("⏱️ Time has expired! Your quiz attempt is being submitted automatically.");
      submitActiveQuiz();
    }
    remaining--;
  }

  update();
  quizTimerInterval = setInterval(update, 1000);
}

function renderQuizRunnerQuestion(index) {
  const container = document.getElementById("quizRunnerBody");
  const questions = activeQuizData.questions;

  if (index < 0 || index >= questions.length) return;
  activeQuizQuestionIndex = index;

  const q = questions[index];
  const userAns = activeQuizAnswers[q.questionId] || {};

  document.getElementById("quizQuestionCounter").innerText = `Question ${index + 1} of ${questions.length}`;
  document.getElementById("quizPrevBtn").disabled = index === 0;
  document.getElementById("quizNextBtn").style.display = index === questions.length - 1 ? "none" : "inline-block";

  let optionsHtml = "";

  if (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") {
    optionsHtml = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
        ${q.options.map((opt, i) => `
          <label style="display: flex; align-items: center; gap: 0.75rem; background: #f8fafc; border: 1px solid var(--neutral-200); border-radius: var(--radius); padding: 0.75rem 1rem; cursor: pointer;">
            <input type="radio" name="runnerOption" value="${opt.id}" ${userAns.selectedOptionId === opt.id ? "checked" : ""} onchange="recordRunnerAnswer('${q.questionId}', '${opt.id}')" />
            <span style="font-weight: 500;">${String.fromCharCode(65 + i)}) ${opt.optionText}</span>
          </label>
        `).join("")}
      </div>
    `;
  } else {
    optionsHtml = `
      <div style="margin-top: 1rem;">
        <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Your Written Response:</label>
        <textarea id="runnerTextResponse" rows="4" style="width: 100%;" placeholder="Enter explanation or code..." oninput="recordRunnerTextAnswer('${q.questionId}', this.value)">${userAns.textResponse || ""}</textarea>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="badge" style="background: #e2e8f0; color: #334155;">${q.type.replace(/_/g, " ")}</span>
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--neutral-600);">${q.points} Points</span>
      </div>
      <h3 style="margin-top: 0.75rem; font-size: 1.15rem; line-height: 1.5;">${q.prompt}</h3>
    </div>
    ${optionsHtml}
  `;
}

function navigateQuizQuestion(step) {
  renderQuizRunnerQuestion(activeQuizQuestionIndex + step);
}

function recordRunnerAnswer(questionId, selectedOptionId) {
  if (!activeQuizAnswers[questionId]) activeQuizAnswers[questionId] = {};
  activeQuizAnswers[questionId].selectedOptionId = selectedOptionId;

  // Background save draft
  fetch(`/api/v1/quizzes/attempts/${activeQuizData.attemptId}/draft`, {
    method: "POST",
    headers: { ...getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, selectedOptionId }),
  }).catch(() => {});
}

function recordRunnerTextAnswer(questionId, text) {
  if (!activeQuizAnswers[questionId]) activeQuizAnswers[questionId] = {};
  activeQuizAnswers[questionId].textResponse = text;

  // Background save draft
  fetch(`/api/v1/quizzes/attempts/${activeQuizData.attemptId}/draft`, {
    method: "POST",
    headers: { ...getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, textResponse: text }),
  }).catch(() => {});
}

function confirmExitQuiz() {
  if (confirm("⚠️ Are you sure you want to exit? Your timer will continue running on the server until expiration.")) {
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    closeModal("takeQuizModal");
  }
}

async function submitActiveQuiz() {
  if (quizTimerInterval) clearInterval(quizTimerInterval);

  const answersArray = Object.keys(activeQuizAnswers).map((qId) => ({
    questionId: qId,
    selectedOptionId: activeQuizAnswers[qId].selectedOptionId,
    textResponse: activeQuizAnswers[qId].textResponse,
  }));

  try {
    const res = await fetch(`/api/v1/quizzes/attempts/${activeQuizData.attemptId}/submit`, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answersArray }),
    });
    const result = await res.json();

    closeModal("takeQuizModal");

    if (!result.success) return alert(result.error);

    const data = result.data;
    document.getElementById("quizResultScore").innerText = `${Math.round(data.score)}%`;
    document.getElementById("quizResultPoints").innerText = `${data.totalEarned} of ${data.totalPossible} points earned`;

    const icon = data.passed ? "🏆" : data.status === "NEEDS_GRADING" ? "📝" : "⚠️";
    document.getElementById("quizResultIcon").innerText = icon;
    document.getElementById("quizResultTitle").innerText = data.passed
      ? "Congratulations! You Passed!"
      : data.status === "NEEDS_GRADING"
      ? "Submitted for Faculty Grading"
      : "Quiz Completed";

    const badge = data.passed
      ? '<span class="badge badge-submitted">PASSED</span>'
      : data.status === "NEEDS_GRADING"
      ? '<span class="badge badge-late">PENDING MANUAL REVIEW</span>'
      : '<span class="badge badge-overdue">FAILED</span>';

    document.getElementById("quizResultBadgeContainer").innerHTML = badge;

    document.getElementById("openReviewFromResultBtn").onclick = () => {
      closeModal("quizResultModal");
      openQuizReview(data.attemptId);
    };

    document.getElementById("quizResultModal").classList.remove("hidden");
    loadQuizzes();
  } catch (err) {
    alert(`Submission error: ${err.message}`);
  }
}

// ----------------------------------------------------
// QUIZ REVIEW ENGINE
// ----------------------------------------------------
async function openQuizReview(attemptId) {
  try {
    const res = await fetch(`/api/v1/quizzes/attempts/${attemptId}/review`, { headers: getAuthHeader() });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    const a = result.data;
    document.getElementById("reviewQuizTitle").innerText = `Review: ${a.quizTitle}`;
    document.getElementById("reviewScoreHeader").innerText = `Score: ${Math.round(a.score)}% | ${a.passed ? "Passed ✅" : "Not Passed ❌"}`;

    document.getElementById("quizReviewBody").innerHTML = a.questions.map((q, idx) => {
      const isCorrect = q.isCorrect;
      const statusIcon = isCorrect === true ? "✅" : isCorrect === false ? "❌" : "📝";

      let optionsReview = "";
      if (q.options && q.options.length > 0) {
        optionsReview = q.options.map((opt) => {
          const isChosen = q.selectedOptionId === opt.id;
          const isActualCorrect = opt.isCorrect;
          let border = "1px solid var(--neutral-200)";
          let bg = "#fff";

          if (isActualCorrect) {
            bg = "#dcfce7";
            border = "1px solid #86efac";
          } else if (isChosen && !isActualCorrect) {
            bg = "#fee2e2";
            border = "1px solid #fca5a5";
          }

          return `
            <div style="background: ${bg}; border: ${border}; border-radius: var(--radius); padding: 0.6rem 0.75rem; margin-top: 0.35rem; font-size: 0.9rem;">
              ${isActualCorrect ? "⭐ " : ""}${opt.optionText} ${isChosen ? "<strong>(Your Answer)</strong>" : ""}
            </div>
          `;
        }).join("");
      } else {
        optionsReview = `
          <div style="background: #f8fafc; padding: 0.75rem; border-radius: var(--radius); margin-top: 0.5rem; font-size: 0.9rem;">
            <strong>Your Response:</strong> ${q.textResponse || "<em>No response</em>"}
          </div>
        `;
      }

      return `
        <div style="border: 1px solid var(--neutral-200); border-radius: var(--radius); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-weight: 700;">Question ${idx + 1} (${q.pointsAwarded} / ${q.points} pts)</span>
            <span>${statusIcon}</span>
          </div>
          <p style="margin: 0; font-weight: 600;">${q.prompt}</p>
          ${optionsReview}
          ${q.explanation ? `<div style="margin-top: 0.75rem; font-size: 0.85rem; color: #4338ca; background: #eef2ff; padding: 0.5rem 0.75rem; border-radius: 4px;">💡 <strong>Explanation:</strong> ${q.explanation}</div>` : ""}
          ${q.graderFeedback ? `<div style="margin-top: 0.5rem; font-size: 0.85rem; color: #92400e; background: #fef3c7; padding: 0.5rem 0.75rem; border-radius: 4px;">👨‍🏫 <strong>Instructor Feedback:</strong> ${q.graderFeedback}</div>` : ""}
        </div>
      `;
    }).join("");

    document.getElementById("quizReviewModal").classList.remove("hidden");
  } catch (err) {
    alert(err.message);
  }
}

// ----------------------------------------------------
// PRACTICE ARENA ENGINE
// ----------------------------------------------------
async function loadPracticeQuestions() {
  const container = document.getElementById("practiceContainer");
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading practice questions...</div>';

  const courseOfferingId = document.getElementById("quizzesOfferingFilter")?.value || "";
  const difficulty = document.getElementById("practiceDifficultyFilter")?.value || "";
  const search = document.getElementById("quizzesSearchInput")?.value.trim() || "";

  const params = new URLSearchParams();
  if (courseOfferingId) params.append("courseOfferingId", courseOfferingId);
  if (difficulty) params.append("difficulty", difficulty);
  if (search) params.append("search", search);

  try {
    const res = await fetch(`/api/v1/quizzes/questions?${params.toString()}`, { headers: getAuthHeader() });
    const result = await res.json();

    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; background: white; border-radius: 8px; border: 1px solid var(--neutral-200);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">💡</div>
          <h3>No Practice Questions Found</h3>
          <p style="color: var(--neutral-600); margin-top: 0.5rem;">No questions match your current filter. Try selecting another course or difficulty.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = result.data.map(renderPracticeCard).join("");
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 2rem;">${err.message}</div>`;
  }
}

function renderPracticeCard(q) {
  return `
    <div class="assignment-card" style="margin-bottom: 1rem;" id="pracCard_${q.id}">
      <div class="card-header">
        <div>
          <span class="badge" style="background: #e0e7ff; color: #3730a3;">${q.difficulty}</span>
          ${q.topic ? `<span class="badge" style="background: #f1f5f9; color: #334155;">🏷️ ${q.topic}</span>` : ""}
          <h3 class="card-title" style="margin-top: 0.5rem;">${q.prompt}</h3>
        </div>
      </div>

      <div style="margin: 1rem 0;">
        ${q.options && q.options.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${q.options.map((opt, i) => `
              <label style="display: flex; align-items: center; gap: 0.75rem; background: #f8fafc; border: 1px solid var(--neutral-200); border-radius: var(--radius); padding: 0.6rem 0.75rem; cursor: pointer;">
                <input type="radio" name="practiceOpt_${q.id}" value="${opt.id}" />
                <span>${String.fromCharCode(65 + i)}) ${opt.optionText}</span>
              </label>
            `).join("")}
          </div>
        ` : `
          <textarea id="pracText_${q.id}" rows="2" style="width: 100%;" placeholder="Enter your answer..."></textarea>
        `}
      </div>

      <div id="pracFeedback_${q.id}" class="hidden" style="margin-bottom: 0.75rem; padding: 0.75rem; border-radius: var(--radius);"></div>

      <div class="card-footer">
        <div></div>
        <button class="btn btn-primary btn-sm" onclick="checkPracticeAnswer('${q.id}')">
          💡 Check Answer & Explanation
        </button>
      </div>
    </div>
  `;
}

async function checkPracticeAnswer(questionId) {
  const selectedOpt = document.querySelector(`input[name="practiceOpt_${questionId}"]:checked`);
  const textInput = document.getElementById(`pracText_${questionId}`);

  const selectedOptionId = selectedOpt ? selectedOpt.value : undefined;
  const textResponse = textInput ? textInput.value : undefined;

  try {
    const res = await fetch(`/api/v1/quizzes/questions/${questionId}/practice`, {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ selectedOptionId, textResponse }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    const fb = document.getElementById(`pracFeedback_${questionId}`);
    fb.classList.remove("hidden");

    if (result.data.isCorrect) {
      fb.style.background = "#dcfce7";
      fb.style.border = "1px solid #86efac";
      fb.style.color = "#15803d";
      fb.innerHTML = `<strong>✅ Correct Answer!</strong><br>${result.data.explanation}`;
    } else {
      fb.style.background = "#fee2e2";
      fb.style.border = "1px solid #fca5a5";
      fb.style.color = "#b91c1c";
      fb.innerHTML = `<strong>❌ Incorrect.</strong><br>${result.data.explanation}`;
    }
  } catch (err) {
    alert(err.message);
  }
}

// ----------------------------------------------------
// INSTRUCTOR QUIZ & QUESTION BUILDER
// ----------------------------------------------------
let optionRowCount = 0;

function addOptionRow(text = "", isCorrect = false) {
  const container = document.getElementById("optionsList");
  const rowId = `optRow_${optionRowCount++}`;

  const row = document.createElement("div");
  row.id = rowId;
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "0.75rem";
  row.style.marginBottom = "0.5rem";

  row.innerHTML = `
    <input type="radio" name="correctOptionRadio" value="${rowId}" ${isCorrect ? "checked" : ""} title="Mark as correct answer" />
    <input type="text" class="opt-text-input" value="${text}" required style="flex: 1;" placeholder="Option text..." />
    <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('${rowId}').remove()">&times;</button>
  `;
  container.appendChild(row);
}

document.getElementById("openCreateQuestionModalBtn")?.addEventListener("click", () => {
  loadQuizzesOfferings();
  const list = document.getElementById("optionsList");
  list.innerHTML = "";
  optionRowCount = 0;
  addOptionRow("Option 1", true);
  addOptionRow("Option 2", false);
  document.getElementById("createQuestionModal").classList.remove("hidden");
});

document.getElementById("createQuestionForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const courseOfferingId = document.getElementById("qCourseOfferingSelect").value;
  const type = document.getElementById("qTypeSelect").value;
  const difficulty = document.getElementById("qDifficultySelect").value;
  const chapter = document.getElementById("qChapter").value.trim();
  const topic = document.getElementById("qTopic").value.trim();
  const prompt = document.getElementById("qPrompt").value.trim();
  const explanation = document.getElementById("qExplanation").value.trim();

  let options = [];
  if (type === "MULTIPLE_CHOICE" || type === "TRUE_FALSE") {
    const selectedRadio = document.querySelector('input[name="correctOptionRadio"]:checked');
    if (!selectedRadio) {
      alert("Please select which option is correct by clicking the radio button.");
      return;
    }

    const rows = document.querySelectorAll("#optionsList > div");
    rows.forEach((row) => {
      const textInput = row.querySelector(".opt-text-input");
      const isCorrect = row.querySelector('input[type="radio"]').checked;
      if (textInput && textInput.value.trim()) {
        options.push({ optionText: textInput.value.trim(), isCorrect });
      }
    });

    if (options.length < 2) {
      alert("Please provide at least 2 options.");
      return;
    }
  }

  try {
    const res = await fetch("/api/v1/quizzes/questions", {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ courseOfferingId, type, difficulty, chapter, topic, prompt, explanation, options }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    alert("✅ Practice question created successfully!");
    closeModal("createQuestionModal");
    document.getElementById("createQuestionForm").reset();
    if (activeQuizSubView === "practice") loadPracticeQuestions();
  } catch (err) {
    alert(err.message);
  }
});

// Quiz Creator Modal Handler
document.getElementById("openCreateQuizModalBtn")?.addEventListener("click", () => {
  loadQuizzesOfferings();
  document.getElementById("createQuizModal").classList.remove("hidden");
});

document.getElementById("quizCourseOfferingSelect")?.addEventListener("change", async (e) => {
  const offeringId = e.target.value;
  const picker = document.getElementById("quizQuestionPickerList");
  if (!offeringId) {
    picker.innerHTML = '<p style="color: var(--neutral-600); font-size: 0.85rem;">Select course offering to load questions from bank.</p>';
    return;
  }

  picker.innerHTML = '<p style="color: var(--neutral-600); font-size: 0.85rem;">Loading questions...</p>';

  try {
    const res = await fetch(`/api/v1/quizzes/questions?courseOfferingId=${offeringId}`, { headers: getAuthHeader() });
    const result = await res.json();
    if (!result.success || !result.data || result.data.length === 0) {
      picker.innerHTML = '<p style="color: var(--neutral-600); font-size: 0.85rem;">No questions found in bank for this course. Add questions first.</p>';
      return;
    }

    picker.innerHTML = result.data.map((q) => `
      <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; border-bottom: 1px solid var(--neutral-100); font-size: 0.85rem; cursor: pointer;">
        <input type="checkbox" class="quiz-q-checkbox" value="${q.id}" checked />
        <span>[${q.difficulty}] ${q.prompt.slice(0, 65)}...</span>
      </label>
    `).join("");
  } catch (err) {
    picker.innerHTML = `<p style="color: var(--danger); font-size: 0.85rem;">${err.message}</p>`;
  }
});

document.getElementById("createQuizForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("quizTitleInput").value.trim();
  const courseOfferingId = document.getElementById("quizCourseOfferingSelect").value;
  const description = document.getElementById("quizDescInput").value.trim();
  const durationMin = parseInt(document.getElementById("quizDurationInput").value, 10);
  const passingScore = parseFloat(document.getElementById("quizPassingScoreInput").value);
  const maxAttempts = parseInt(document.getElementById("quizMaxAttemptsInput").value, 10);
  const shuffleQuestions = document.getElementById("quizShuffleQ").checked;
  const shuffleOptions = document.getElementById("quizShuffleOpt").checked;

  const checkedQuestions = Array.from(document.querySelectorAll(".quiz-q-checkbox:checked")).map((cb) => cb.value);

  try {
    const res = await fetch("/api/v1/quizzes", {
      method: "POST",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        courseOfferingId,
        description,
        durationMin,
        passingScore,
        maxAttempts,
        shuffleQuestions,
        shuffleOptions,
      }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    const quizId = result.data.id;

    // Attach selected questions
    for (let i = 0; i < checkedQuestions.length; i++) {
      await fetch(`/api/v1/quizzes/${quizId}/questions`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: checkedQuestions[i], points: 1.0, orderIndex: i }),
      });
    }

    alert("✅ Quiz created successfully with selected questions!");
    closeModal("createQuizModal");
    document.getElementById("createQuizForm").reset();
    loadQuizzes();
  } catch (err) {
    alert(err.message);
  }
});

async function toggleQuizPublish(quizId, shouldPublish) {
  try {
    const res = await fetch(`/api/v1/quizzes/${quizId}`, {
      method: "PATCH",
      headers: { ...getAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: shouldPublish }),
    });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    alert(`Quiz status updated to: ${shouldPublish ? "Published" : "Draft"}`);
    loadQuizzes();
  } catch (err) {
    alert(err.message);
  }
}

async function openQuizAnalytics(quizId) {
  try {
    const res = await fetch(`/api/v1/quizzes/${quizId}/stats`, { headers: getAuthHeader() });
    const result = await res.json();
    if (!result.success) return alert(result.error);

    const s = result.data;
    document.getElementById("analyticsQuizTitle").innerText = `Analytics: ${s.title} (${s.course.code})`;

    document.getElementById("quizAnalyticsBody").innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; text-align: center;">
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700;">${s.totalAttempts}</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Total Attempts</div>
        </div>
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700;">${s.uniqueStudents}</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Students</div>
        </div>
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700; color: #16a34a;">${s.passRate}%</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Pass Rate</div>
        </div>
        <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius); border: 1px solid var(--neutral-200);">
          <div style="font-size: 1.5rem; font-weight: 700; color: #4f46e5;">${s.avgScore}%</div>
          <div style="font-size: 0.8rem; color: var(--neutral-600);">Average Score</div>
        </div>
      </div>

      <h4 style="margin-bottom: 0.75rem;">Student Attempt History:</h4>
      ${s.attempts.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Attempt</th>
              <th>Score</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${s.attempts.map((att) => `
              <tr>
                <td><strong>${att.student.fullName}</strong> (${att.student.campusId || "Student"})</td>
                <td>#${att.attemptNum}</td>
                <td>${Math.round(att.score)}%</td>
                <td><span class="badge ${att.passed ? "badge-submitted" : "badge-overdue"}">${att.passed ? "PASSED" : "FAILED"}</span></td>
                <td>${new Date(att.submittedAt).toLocaleString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : `<p style="color: var(--neutral-600);">No student attempts recorded yet.</p>`}
    `;

    document.getElementById("quizAnalyticsModal").classList.remove("hidden");
  } catch (err) {
    alert(err.message);
  }
}

// Filter listeners
document.getElementById("quizzesOfferingFilter")?.addEventListener("change", () => {
  if (activeQuizSubView === "quizzes") loadQuizzes();
  else loadPracticeQuestions();
});
document.getElementById("practiceDifficultyFilter")?.addEventListener("change", loadPracticeQuestions);
document.getElementById("refreshQuizzesBtn")?.addEventListener("click", () => {
  if (activeQuizSubView === "quizzes") loadQuizzes();
  else loadPracticeQuestions();
});
document.getElementById("quizzesSearchInput")?.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    if (activeQuizSubView === "quizzes") loadQuizzes();
    else loadPracticeQuestions();
  }
});

// Initial boot
document.addEventListener("DOMContentLoaded", () => {
  checkAuthSession();
  loadDashboard();
  loadNotifications();
});

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

// Initial boot
document.addEventListener("DOMContentLoaded", () => {
  checkAuthSession();
  loadDashboard();
  loadNotifications();
});

import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "tasks_v3";
const THEME_KEY = "theme_v1";

const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const taskPriority = document.getElementById("task-priority");
const taskDate = document.getElementById("task-date");
const addTaskBtn = document.getElementById("add-task-btn");

const taskList = document.getElementById("task-list");
const taskCounter = document.getElementById("task-counter");

const clearBtn = document.getElementById("clear-btn");
const clearCompletedBtn = document.getElementById("clear-completed-btn");
const filterButtons = document.querySelectorAll(".filter-btn");
const sortSelect = document.getElementById("sort-select");
const themeToggle = document.getElementById("theme-toggle");

let tasks = loadTasks();
let currentFilter = "all";
let currentSort = "custom";
let draggedTaskId = null;

init();

function markNativePlatform() {
  if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add("native-app");
    document.body.classList.add("native-app");
  }
}

function init() {
  markNativePlatform();
  applySavedTheme();
  hidePortfolioLinkInMobileApp();
  bindEvents();
  updateAddButtonState();
  render();
}

function bindEvents() {
  taskInput.addEventListener("input", updateAddButtonState);

  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = taskInput.value.trim();
    if (!text) return;

    const newTask = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      text,
      completed: false,
      priority: taskPriority.value,
      date: taskDate.value || null,
      createdAt: Date.now(),
      order: getNextOrderValue(),
    };

    tasks.push(newTask);
    saveTasks();
    taskForm.reset();
    taskPriority.value = "medium";
    taskInput.focus();
    updateAddButtonState();
    render();
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;

      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      render();
    });
  });

  sortSelect.addEventListener("change", () => {
    currentSort = sortSelect.value;
    render();
  });

  themeToggle.addEventListener("click", () => {
    const html = document.documentElement;
    const nextTheme = html.dataset.theme === "dark" ? "light" : "dark";
    html.dataset.theme = nextTheme;
    localStorage.setItem(THEME_KEY, nextTheme);
    updateThemeButtonLabel();
  });

  clearBtn.addEventListener("click", () => {
    if (tasks.length === 0) return;

    const confirmed = confirm("Supprimer toutes les tâches ?");
    if (!confirmed) return;

    tasks = [];
    saveTasks();
    render();
  });

  clearCompletedBtn.addEventListener("click", () => {
    const completedCount = tasks.filter((task) => task.completed).length;
    if (completedCount === 0) return;

    const confirmed = confirm("Supprimer toutes les tâches terminées ?");
    if (!confirmed) return;

    tasks = tasks.filter((task) => !task.completed);
    normalizeTaskOrderFromCurrentArray();
    saveTasks();
    render();
  });
}

function updateAddButtonState() {
  addTaskBtn.disabled = taskInput.value.trim() === "";
}

function isMobileApp() {
  return window.Capacitor?.isNativePlatform?.() === true;
}

function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function hidePortfolioLinkInMobileApp() {
  if (!Capacitor.isNativePlatform()) return;

  requestAnimationFrame(() => {
    document
      .querySelectorAll('.portfolio-link, a[href*="kuvaaia.github.io/portfolio"]')
      .forEach((link) => link.remove());
  });
}

function loadTasks() {
  try {
    const savedTasks = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!Array.isArray(savedTasks)) {
      return [];
    }

    return savedTasks.map((task, index) => ({
      id: task.id ?? String(Date.now() + index),
      text: task.text ?? "",
      completed: Boolean(task.completed),
      priority: task.priority ?? "medium",
      date: task.date ?? null,
      createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now() + index,
      order: typeof task.order === "number" ? task.order : index,
    }));
  } catch (error) {
    console.error("Erreur lors du chargement des tâches :", error);
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function getNextOrderValue() {
  if (tasks.length === 0) return 0;
  return Math.max(...tasks.map((task) => task.order ?? 0)) + 1;
}

function render() {
  taskList.innerHTML = "";

  const filteredTasks = getFilteredTasks();
  const displayedTasks = sortTasks(filteredTasks);

  if (displayedTasks.length === 0) {
    taskList.innerHTML = `<p class="empty">Aucune tâche pour ce filtre</p>`;
    updateTaskCounter();
    return;
  }

  displayedTasks.forEach((task) => {
    taskList.appendChild(createTaskElement(task));
  });

  updateTaskCounter();
}

function getFilteredTasks() {
  const today = getTodayString();

  switch (currentFilter) {
    case "active":
      return tasks.filter((task) => !task.completed);
    case "completed":
      return tasks.filter((task) => task.completed);
    case "today":
      return tasks.filter((task) => task.date === today);
    case "high":
      return tasks.filter((task) => task.priority === "high");
    case "all":
    default:
      return tasks;
  }
}

function sortTasks(taskArray) {
  const copied = [...taskArray];

  switch (currentSort) {
    case "newest":
      return copied.sort((a, b) => b.createdAt - a.createdAt);

    case "oldest":
      return copied.sort((a, b) => a.createdAt - b.createdAt);

    case "priority":
      return copied.sort(
        (a, b) => getPriorityWeight(b.priority) - getPriorityWeight(a.priority)
      );

    case "dateAsc":
      return copied.sort((a, b) => compareTaskDates(a, b, "asc"));

    case "dateDesc":
      return copied.sort((a, b) => compareTaskDates(a, b, "desc"));

    case "custom":
    default:
      return copied.sort((a, b) => a.order - b.order);
  }
}

function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = `task-item ${task.completed ? "completed" : ""}`;
  li.dataset.taskId = task.id;

  const canDrag =
    currentSort === "custom" &&
    currentFilter === "all" &&
    !isTouchDevice() &&
    !isMobileApp();

  if (canDrag) {
    li.draggable = true;
    addDragEvents(li, task.id);
  }

  const leftBox = document.createElement("div");
  leftBox.className = "task-left";

  const dragHandle = document.createElement("div");
  dragHandle.className = "drag-handle";
  dragHandle.textContent = canDrag ? "⋮⋮" : "•";
  dragHandle.title = canDrag ? "Glisser pour réorganiser" : "Réorganisation mobile";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-check";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", `Marquer "${task.text}" comme terminée`);
  checkbox.addEventListener("change", () => toggleTask(task.id));

  leftBox.appendChild(dragHandle);
  leftBox.appendChild(checkbox);

  const taskMain = document.createElement("div");
  taskMain.className = "task-main";

  const taskTop = document.createElement("div");
  taskTop.className = "task-top";

  const textElement = document.createElement("div");
  textElement.className = "task-text";
  textElement.textContent = task.text;
  textElement.title = "Double-clique pour modifier";
  textElement.addEventListener("dblclick", () => {
    startInlineEdit(task.id, textElement);
  });

  const taskMeta = document.createElement("div");
  taskMeta.className = "task-meta";

  const priorityBadge = document.createElement("span");
  priorityBadge.className = `badge ${task.priority}`;
  priorityBadge.textContent = getPriorityLabel(task.priority);
  taskMeta.appendChild(priorityBadge);

  if (task.date) {
    const dateElement = document.createElement("span");
    dateElement.className = "badge";
    dateElement.textContent = formatDate(task.date);
    taskMeta.appendChild(dateElement);
  }

  taskTop.appendChild(textElement);
  taskMain.appendChild(taskTop);
  taskMain.appendChild(taskMeta);

  const controls = document.createElement("div");
  controls.className = "task-controls";

  if (isTouchDevice() || isMobileApp()) {
    const upBtn = document.createElement("button");
    upBtn.className = "icon-btn";
    upBtn.type = "button";
    upBtn.textContent = "⬆️";
    upBtn.addEventListener("click", () => moveTaskUp(task.id));

    const downBtn = document.createElement("button");
    downBtn.className = "icon-btn";
    downBtn.type = "button";
    downBtn.textContent = "⬇️";
    downBtn.addEventListener("click", () => moveTaskDown(task.id));

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
  }

  const toggleBtn = document.createElement("button");
  toggleBtn.className = `icon-btn ${task.completed ? "undo-btn" : "complete-btn"}`;
  toggleBtn.type = "button";
  toggleBtn.textContent = task.completed ? "Annuler" : "Terminer";
  toggleBtn.addEventListener("click", () => toggleTask(task.id));

  const editBtn = document.createElement("button");
  editBtn.className = "icon-btn edit-btn";
  editBtn.type = "button";
  editBtn.textContent = "Modifier";
  editBtn.addEventListener("click", () => startInlineEdit(task.id, textElement));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "icon-btn delete-btn";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Supprimer";
  deleteBtn.addEventListener("click", () => deleteTask(task.id));

  controls.appendChild(toggleBtn);
  controls.appendChild(editBtn);
  controls.appendChild(deleteBtn);

  li.appendChild(leftBox);
  li.appendChild(taskMain);
  li.appendChild(controls);

  return li;
}

function addDragEvents(element, taskId) {
  element.addEventListener("dragstart", () => {
    draggedTaskId = taskId;
    element.classList.add("dragging");
  });

  element.addEventListener("dragend", () => {
    draggedTaskId = null;
    element.classList.remove("dragging");

    document.querySelectorAll(".task-item").forEach((item) => {
      item.classList.remove("drag-over");
    });
  });

  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (draggedTaskId === taskId) return;
    element.classList.add("drag-over");
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("drag-over");
  });

  element.addEventListener("drop", (event) => {
    event.preventDefault();
    element.classList.remove("drag-over");

    if (!draggedTaskId || draggedTaskId === taskId) return;

    moveTaskBefore(draggedTaskId, taskId);
  });
}

function moveTaskBefore(draggedId, targetId) {
  const ordered = [...tasks].sort((a, b) => a.order - b.order);

  const draggedIndex = ordered.findIndex((task) => task.id === draggedId);
  const targetIndex = ordered.findIndex((task) => task.id === targetId);

  if (draggedIndex === -1 || targetIndex === -1) return;

  const [draggedTask] = ordered.splice(draggedIndex, 1);
  ordered.splice(targetIndex, 0, draggedTask);

  tasks = ordered.map((task, index) => ({
    ...task,
    order: index,
  }));

  saveTasks();
  render();
}

function moveTaskUp(taskId) {
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((task) => task.id === taskId);

  if (index <= 0) return;

  [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];

  tasks = ordered.map((task, i) => ({
    ...task,
    order: i,
  }));

  saveTasks();
  render();
}

function moveTaskDown(taskId) {
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((task) => task.id === taskId);

  if (index === -1 || index >= ordered.length - 1) return;

  [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];

  tasks = ordered.map((task, i) => ({
    ...task,
    order: i,
  }));

  saveTasks();
  render();
}

function normalizeTaskOrderFromCurrentArray() {
  tasks = tasks.map((task, index) => ({
    ...task,
    order: index,
  }));
}

function toggleTask(taskId) {
  tasks = tasks.map((task) =>
    task.id === taskId ? { ...task, completed: !task.completed } : task
  );

  saveTasks();
  render();
}

function deleteTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;

  const confirmed = confirm(`Supprimer la tâche "${task.text}" ?`);
  if (!confirmed) return;

  tasks = tasks.filter((item) => item.id !== taskId);
  normalizeTaskOrderFromCurrentArray();
  saveTasks();
  render();
}

function updateTask(taskId, newText) {
  const cleanText = newText.trim();
  if (!cleanText) return false;

  tasks = tasks.map((task) =>
    task.id === taskId ? { ...task, text: cleanText } : task
  );

  saveTasks();
  render();
  return true;
}

function startInlineEdit(taskId, textElement) {
  const currentTask = tasks.find((task) => task.id === taskId);
  if (!currentTask) return;

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentTask.text;
  input.className = "edit-input";
  input.maxLength = 120;

  const saveEdit = () => {
    const updated = updateTask(taskId, input.value);
    if (!updated) {
      render();
    }
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveEdit();
    if (event.key === "Escape") render();
  });

  input.addEventListener("blur", saveEdit);

  textElement.replaceWith(input);
  input.focus();
  input.select();
}

function updateTaskCounter() {
  const completedCount = tasks.filter((task) => task.completed).length;
  const activeCount = tasks.length - completedCount;

  taskCounter.textContent = `${activeCount} à faire · ${completedCount} terminée(s)`;
}

function getPriorityLabel(priority) {
  switch (priority) {
    case "high":
      return "Haute";
    case "medium":
      return "Moyenne";
    case "low":
      return "Faible";
    default:
      return "Sans priorité";
  }
}

function getPriorityWeight(priority) {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function compareTaskDates(a, b, direction = "asc") {
  const aTime = a.date
    ? new Date(`${a.date}T00:00:00`).getTime()
    : Number.MAX_SAFE_INTEGER;

  const bTime = b.date
    ? new Date(`${b.date}T00:00:00`).getTime()
    : Number.MAX_SAFE_INTEGER;

  return direction === "asc" ? aTime - bTime : bTime - aTime;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.dataset.theme = savedTheme;
  updateThemeButtonLabel();
}

function updateThemeButtonLabel() {
  const isDark = document.documentElement.dataset.theme === "dark";
  themeToggle.textContent = isDark ? "☀️ Mode clair" : "🌙 Mode sombre";
}
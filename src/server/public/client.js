const term = new Terminal({ theme: { background: '#1a1a1a', foreground: '#e0e0e0' }, cursorBlink: true });
term.open(document.getElementById('terminal'));
term.writeln('\x1b[1;36mAI4SE Coding Agent Harness\x1b[0m');
term.writeln('Type a task and press Run, or use the CLI: harness run "<task>"\n');

const socket = io();
let state = 'IDLE';
let turnCount = 0;
let retryCount = 0;

function updateStatus(newState) {
  state = newState;
  var dot = document.getElementById('status-dot');
  dot.className = 'status-dot ' + newState.toLowerCase();
  document.getElementById('state-label').textContent = newState;
}

socket.on('transition', function(t) {
  turnCount++;
  document.getElementById('turn-count').textContent = turnCount;

  if (t.to === 'FEEDBACK') retryCount++;
  document.getElementById('retry-count').textContent = retryCount + '/5';

  updateStatus(t.to);

  var colors = { THINKING: '\x1b[36m', GUARDING: '\x1b[33m', EXECUTING: '\x1b[32m', WAITING_APPROVAL: '\x1b[31m', OBSERVING: '\x1b[35m', FEEDBACK: '\x1b[33m', DONE: '\x1b[32m', IDLE: '\x1b[37m' };
  var color = colors[t.to] || '\x1b[37m';

  var actionText = '';
  if (t.action && t.action.type) {
    actionText = t.action.type + '(' + JSON.stringify(t.action.params).slice(0, 80) + ')';
  }
  term.writeln(color + '[' + t.from + ' → ' + t.to + ']\x1b[0m ' + actionText);

  if (t.metadata && t.metadata.reason) term.writeln('  Reason: ' + t.metadata.reason);
  if (t.result) {
    if (t.result.stdout) term.writeln('  stdout: ' + t.result.stdout.slice(0, 200));
    if (t.result.stderr) term.writeln('  \x1b[31mstderr: ' + t.result.stderr.slice(0, 200) + '\x1b[0m');
  }

  if (t.to === 'WAITING_APPROVAL') {
    document.getElementById('dangerous-command').textContent = (t.action && t.action.params && t.action.params.command) || '';
    document.getElementById('dangerous-reason').textContent = (t.metadata && t.metadata.reason) || '';
    document.getElementById('approval-overlay').style.display = 'flex';
  }
});

document.getElementById('run-btn').addEventListener('click', function() {
  var task = document.getElementById('task-input').value.trim();
  if (!task) return;
  term.clear();
  term.writeln('\x1b[1;36mTask: ' + task + '\x1b[0m\n');
  turnCount = 0; retryCount = 0;
  updateStatus('IDLE');
  socket.emit('run-task', task, function(response) {
    term.writeln('\n\x1b[1m' + (response.success ? '\x1b[32m✓ Task completed' : '\x1b[31m✗ Task failed') + '\x1b[0m');
    term.writeln('Reason: ' + response.reason);
    updateStatus(response.success ? 'DONE' : 'DONE');
  });
});

document.getElementById('approve-btn').addEventListener('click', function() {
  document.getElementById('approval-overlay').style.display = 'none';
  socket.emit('approve');
});

document.getElementById('reject-btn').addEventListener('click', function() {
  document.getElementById('approval-overlay').style.display = 'none';
  socket.emit('reject');
});

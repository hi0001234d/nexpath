#!/usr/bin/env python3
"""Run a command with its OWN controlling terminal, and answer its popup automatically.

Why this exists: NexPath's CLI popup does not read normal stdin — it opens /dev/tty, the
terminal that owns the process. Started plainly, it would draw on the operator's screen and
wait for a human. Here the child gets a private pseudo-terminal instead:

    stdin  : a pipe  -> the hook payload (JSON) goes in, EOF closes it
    stdout : a pipe  -> the hook's JSON reply comes back clean
    /dev/tty: OUR pty -> the popup renders here, and we press Enter for it

Enter is sent when the popup's own hint appears, or after the terminal has been quiet for a
moment (so a changed hint can never hang a run). Every keypress is reported on stderr.
"""
import argparse, errno, fcntl, os, pty, select, signal, subprocess, sys, termios, time

ap = argparse.ArgumentParser()
ap.add_argument('--timeout', type=float, default=180.0)
ap.add_argument('--marker', action='append', default=[], help='send Enter when this text appears')
ap.add_argument('--quiet-ms', type=int, default=1500, help='or after the terminal is idle this long')
ap.add_argument('--max-enters', type=int, default=3)
ap.add_argument('--tty-log', default=None, help='save everything drawn on the pty')
ap.add_argument('cmd', nargs=argparse.REMAINDER)
a = ap.parse_args()
cmd = a.cmd[1:] if a.cmd and a.cmd[0] == '--' else a.cmd
if not cmd:
    print('pty-run: no command', file=sys.stderr); sys.exit(2)

payload = sys.stdin.buffer.read()
master, slave = pty.openpty()

def become_session_leader_with_tty():
    os.setsid()                                  # new session, no inherited terminal
    fcntl.ioctl(slave, termios.TIOCSCTTY, 0)     # our pty becomes the child's /dev/tty

child = subprocess.Popen(
    cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    preexec_fn=become_session_leader_with_tty, close_fds=True,
)
os.close(slave)
child.stdin.write(payload); child.stdin.close()

out, err, tty_all, tty_scan = b'', b'', b'', b''   # tty_all: the log · tty_scan: the window we match markers in
enters, last_tty, started = 0, None, time.time()
markers = [m.encode() for m in (a.marker or [])]

def press_enter(why):
    global enters
    if enters >= a.max_enters: return
    try: os.write(master, b'\r')
    except OSError: return
    enters += 1
    print(f'pty-run: sent Enter ({why}) [{enters}]', file=sys.stderr)

fds = [master, child.stdout, child.stderr]
while True:
    if time.time() - started > a.timeout:
        print('pty-run: timeout — killing', file=sys.stderr)
        try: os.killpg(os.getpgid(child.pid), signal.SIGKILL)
        except Exception: child.kill()
        break
    r, _, _ = select.select([f for f in fds if f is not None], [], [], 0.2)
    for f in r:
        try:
            chunk = os.read(master, 65536) if f is master else f.read1(65536)
        except OSError as e:
            if e.errno in (errno.EIO, errno.EBADF): chunk = b''
            else: raise
        if f is master:
            if chunk:
                tty_all += chunk; tty_scan += chunk; last_tty = time.time()
                if markers and any(m in tty_scan for m in markers):
                    press_enter('marker')
                    # clear the scan window, or the same hint would be answered again and again
                    tty_scan = b''
                    tty_all += b'\n<enter sent>\n'
        elif f is child.stdout:
            if chunk: out += chunk
            else: fds[1] = None
        else:
            if chunk: err += chunk
            else: fds[2] = None
    # a drawn popup that then goes quiet is waiting for a human — answer it
    if last_tty and (time.time() - last_tty) * 1000 > a.quiet_ms and child.poll() is None:
        press_enter('quiet'); last_tty = time.time()
    if child.poll() is not None and fds[1] is None and fds[2] is None:
        break

try: out += child.stdout.read() or b''
except Exception: pass
try: err += child.stderr.read() or b''
except Exception: pass
os.close(master)
code = child.wait()

if a.tty_log and tty_all:
    with open(a.tty_log, 'wb') as fh: fh.write(tty_all)
sys.stdout.buffer.write(out)
sys.stderr.buffer.write(err)
print(f'pty-run: exit={code} enters={enters} tty_bytes={len(tty_all)}', file=sys.stderr)
sys.exit(code)

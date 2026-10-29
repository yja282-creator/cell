"""Functional browser checks; requires Python Playwright and Chromium."""
import functools
import os
from pathlib import Path
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
            browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox'])
            try:
                page = browser.new_page(viewport={'width': 1440, 'height': 1100})
                page.clock.install()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                failed_requests = []
                page.on('requestfailed', lambda request: failed_requests.append(request.url))
                page.goto(f'http://127.0.0.1:{server.server_port}')
                page.wait_for_selector('#cell-scene [data-structure="membrane"]')
                assert page.title() == 'CELL — 세포분열 실험실'
                phase_count = 0

                def seek(value):
                    page.locator('#progress').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}', value)

                def count(structure):
                    return page.locator(f'#cell-scene [data-structure="{structure}"]').count()

                for mode, expected_count in [('mitosis', 6), ('meiosis', 11)]:
                    page.locator(f'#{mode}-tab').click()
                    assert page.locator('.phase-button').count() == expected_count
                    for phase_index in range(expected_count):
                        page.locator(f'[data-stage="{phase_index}"]').click()
                        phase_count += 1
                        for progress in [0, 50, 100]:
                            seek(progress)
                            assert page.locator('#progress-label').inner_text() == f'{progress}%'
                            assert page.locator('[aria-current="step"]').count() == 1
                            assert page.locator('#phase-description').inner_text()
                            assert count('membrane') >= 1
                            assert 'NaN' not in page.locator('#cell-scene').inner_html()
                        # Assert chromosome conservation at biologically important stages.
                        if phase_index == 2:
                            assert count('chromosome') == 4
                            assert count('spindle') > 0
                        if phase_index == 3:
                            assert count('chromosome') == (8 if mode == 'mitosis' else 4)
                        if mode == 'meiosis' and phase_index == 8:
                            assert count('chromosome') == 8
                        if phase_index == expected_count - 1:
                            assert count('membrane') == (2 if mode == 'mitosis' else 4)
                            assert count('chromatin') == 8
                            assert count('spindle') == 0

                # Crossover, spindle visibility, and labels change the actual SVG.
                page.locator('[data-stage="2"]').click()
                assert count('chiasma') == 1
                before = page.locator('#cell-scene').inner_html()
                page.locator('#show-crossover').uncheck()
                assert count('chiasma') == 0
                assert before != page.locator('#cell-scene').inner_html()
                page.locator('#show-crossover').check()
                page.locator('#show-spindle').uncheck()
                assert count('spindle') == 0
                page.locator('#show-spindle').check()
                assert count('spindle') > 0
                page.locator('#show-labels').uncheck()
                assert page.locator('.structure-label').count() == 0
                page.locator('#show-labels').check()
                assert page.locator('.structure-label').count() > 0

                # Playback uses elapsed time and selected speed, can pause, and stops at the end.
                page.locator('#mitosis-tab').click()
                page.locator('#speed').select_option('2')
                page.locator('#play').click()
                page.clock.run_for(3700)
                assert '전기' in page.locator('#phase-title').inner_text()
                page.locator('#play').click()
                frozen = page.locator('#progress').input_value()
                page.clock.run_for(1000)
                assert page.locator('#progress').input_value() == frozen
                page.locator('#next').click()
                assert '중기' in page.locator('#phase-title').inner_text()
                page.locator('#prev').click()
                assert '전기' in page.locator('#phase-title').inner_text()
                page.locator('[data-stage="5"]').click()
                seek(95)
                page.locator('#play').click()
                page.clock.run_for(500)
                assert page.locator('#progress').input_value() == '100'
                assert page.locator('#play-text').inner_text() == '재생'
                page.locator('#play').click()
                assert '간기' in page.locator('#phase-title').inner_text()
                page.locator('#reset').click()
                assert page.locator('#progress').input_value() == '0'
                assert page.locator('#prev').is_disabled()
                page.screenshot(path='/tmp/cell-desktop.png', full_page=True)

                # Keyboard tab changes, mobile layout, and anaphase screenshot.
                page.locator('#mitosis-tab').focus()
                page.keyboard.press('ArrowRight')
                assert page.locator('#meiosis-tab').get_attribute('aria-selected') == 'true'
                page.locator('[data-stage="3"]').click()
                seek(85)
                page.screenshot(path='/tmp/cell-meiosis.png', full_page=True)
                page.set_viewport_size({'width': 390, 'height': 844})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.locator('[data-stage="10"]').click()
                seek(100)
                assert count('membrane') == 4
                page.screenshot(path='/tmp/cell-mobile.png', full_page=True)

                # Reduced-motion mode remains interactive and requires explicit playback.
                reduced = browser.new_page(reduced_motion='reduce')
                reduced.goto(f'http://127.0.0.1:{server.server_port}')
                reduced.locator('#next').click()
                assert '전기' in reduced.locator('#phase-title').inner_text()
                assert reduced.locator('#play-text').inner_text() == '재생'
                reduced.close()
                assert not errors, errors
                assert not failed_requests, failed_requests
                print(f'PASS: {phase_count} phases × 3 progress positions, chromosome conservation, '
                      'crossover, toggles, playback, speed, pause, restart, keyboard, mobile, reduced motion; '
                      'no JavaScript errors or failed requests.')
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()

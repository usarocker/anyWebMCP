import { ToolInput, ToolSubmit, ToolOutput } from './types';

export async function fillInputs(inputs: ToolInput[], values: Record<string, string>) {
  for (const input of inputs) {
    const el = document.querySelector(input.selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (el) {
      const val = values[input.name];
      if (val !== undefined) {
        console.log(`[anyWebMCP] Filling input (Paste mode): ${input.selector}`);
        el.focus();
        
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', val);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(pasteEvent);

        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        
        el.blur();
      }
    }
  }
}

export async function submitForm(submit: ToolSubmit) {
  const btn = document.querySelector(submit.selector) as HTMLElement;
  if (!btn) throw new Error(`Submit button not found: ${submit.selector}`);

  console.log(`[anyWebMCP] Clicking submit button: ${submit.selector}`);
  
  btn.focus();
  btn.click();

  const delay = submit.delay > 0 ? submit.delay : 0;
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
}

function extractContent(selector: string, strategy: string = 'first', attributeName?: string): string | any {
  const els = document.querySelectorAll(selector);
  if (els.length === 0) return null;

  if (strategy === 'last') {
    const el = els[els.length - 1] as HTMLElement;
    return attributeName ? el.getAttribute(attributeName) : el.innerText;
  }
  
  if (strategy === 'all_text') {
    return Array.from(els).map(el => attributeName ? el.getAttribute(attributeName) : (el as HTMLElement).innerText).join('\n');
  }

  if (strategy === 'attribute') {
    const el = els[0] as HTMLElement;
    return attributeName ? el.getAttribute(attributeName) : el.innerText;
  }

  const el = els[0] as HTMLElement;
  return attributeName ? el.getAttribute(attributeName) : el.innerText;
}

export async function scrapeOutput(output: ToolOutput): Promise<string> {
  console.log(`[anyWebMCP] Starting scrape for: ${output.selector} (Mode: ${output.mode})`);
  
  if (output.mode === 'static') {
    const result = extractContent(output.selector, output.strategy, output.attributeName);
    if (result === null) throw new Error(`Output container not found: ${output.selector}`);
    return result || '';
  }

  // Observer Mode
  return new Promise((resolve, reject) => {
    // Record pre-existing trigger elements at start (to ignore them)
    const existingTriggers = new Set<Element>();
    if (output.triggerSelector) {
      document.querySelectorAll(output.triggerSelector).forEach(el => existingTriggers.add(el));
      console.log(`[anyWebMCP] Observer started. Ignoring ${existingTriggers.size} pre-existing triggers.`);
    }

    const checkResult = () => {
      const result = extractContent(output.selector, output.strategy, output.attributeName);
      if (result && typeof result === 'string' && result.trim().length > 0) return result.trim();
      return null;
    };

    const finish = () => {
      observer.disconnect();
      clearTimeout(timeoutId);
      // Final scrape of content
      resolve(checkResult() || '');
    };

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      const finalResult = checkResult();
      if (finalResult) resolve(finalResult);
      else reject(new Error(`Timeout waiting for output.`));
    }, output.timeout);

    const observer = new MutationObserver((mutations) => {
      // If trigger selector is configured
      if (output.triggerSelector) {
        const triggers = document.querySelectorAll(output.triggerSelector);
        for (const t of triggers) {
          if (!existingTriggers.has(t)) {
            console.log(`[anyWebMCP] New Trigger element found: ${output.triggerSelector}. Finishing scrape.`);
            finish();
            return;
          }
        }
      } else {
        // Without Trigger: maintain original logic (return once content appears with 1s debounce)
        const result = checkResult();
        if (result) {
          clearTimeout(timeoutId);
          setTimeout(finish, 1000);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    
    // If no Trigger and result already exists, start debounce finish process
    if (!output.triggerSelector && checkResult()) {
       setTimeout(finish, 500);
    }
  });
}

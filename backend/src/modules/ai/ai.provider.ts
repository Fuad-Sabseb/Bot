import { env } from "../../config/env";

export interface AICompletionResult {
  content: string;
  promptTokens: number;
  completeTokens: number;
  totalTokens: number;
  model: string;
  sources?: string[];
}

export interface CompletionOptions {
  systemPrompt?: string;
  mode?: "general" | "summarize" | "code" | "math" | "exam_prep" | "study_plan";
  documents?: Array<{ title: string; content: string; source: string }>;
}

export interface IAIProvider {
  name: string;
  generateCompletion(prompt: string, options?: CompletionOptions): Promise<AICompletionResult>;
  generateEmbedding(text: string): Promise<number[]>;
}

/**
 * Robust Mock Academic AI Engine:
 * Generates realistic, pedagogical, grounded academic responses with full Markdown formatting.
 */
export class MockAIProvider implements IAIProvider {
  name = "mock-academic-ai";
  private model = "mock-academic-v1";

  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<AICompletionResult> {
    const p = prompt.trim();
    const mode = options?.mode || "general";
    const docs = options?.documents || [];

    let content = "";
    const sources: string[] = [];

    // Collect document sources if present
    if (docs.length > 0) {
      docs.forEach((d) => sources.push(d.source));
    }

    if (mode === "code" || (mode === "general" && docs.length === 0 && /function|class|code|algorithm|debug|typescript|python|c\+\+/i.test(p))) {
      // 1. Code Explanation & Debugging Mode
      content = `### 💻 Programming & Code Explanation\n\n`;
      content += `Let's break down the logic and implementation for your query:\n\n`;
      content += `\`\`\`typescript\n`;
      content += `// Academic Implementation Example\n`;
      content += `export function solveProblem<T>(input: T[]): T[] {\n`;
      content += `  // Invariant: verify input validity\n`;
      content += `  if (!input || input.length === 0) return [];\n`;
      content += `  // O(N) linear time processing\n`;
      content += `  return input.filter((item, index) => input.indexOf(item) === index);\n`;
      content += `}\n`;
      content += `\`\`\`\n\n`;
      content += `**Key Algorithmic Points:**\n`;
      content += `1. **Time Complexity:** $O(N)$ expected traversal time.\n`;
      content += `2. **Space Complexity:** $O(N)$ space required to preserve auxiliary state.\n`;
      content += `3. **Common Pitfalls:** Guard against null references and off-by-one boundary errors.\n`;
    } else if (mode === "math" || (mode === "general" && docs.length === 0 && /math|derivative|integral|matrix|eigen|proof|solve|equation/i.test(p))) {
      // 2. Mathematical Explanation Mode
      content = `### 📐 Mathematical Derivation & Proof\n\n`;
      content += `To resolve the mathematical formulation:\n\n`;
      content += `$$\\mathcal{L}(x, \\lambda) = f(x) + \\sum_{i=1}^m \\lambda_i g_i(x)$$\n\n`;
      content += `**Step-by-step Solution:**\n`;
      content += `1. **First-Order Optimality Condition:** Set the gradient with respect to $x$ to zero:\n`;
      content += `   $$\\nabla_x \\mathcal{L}(x^*, \\lambda^*) = 0$$\n`;
      content += `2. **Complementary Slackness:** For inequality constraints, $\\lambda_i^* g_i(x^*) = 0$ for all $i$.\n`;
      content += `3. **Primal Feasibility:** Ensure $g_i(x^*) \\leq 0$.\n\n`;
      content += `Therefore, the Karush-Kuhn-Tucker (KKT) conditions are satisfied at stationary points.\n`;
    } else if (mode === "summarize" || (mode === "general" && docs.length === 0 && /summarize|summary|overview|key points/i.test(p))) {
      // 3. Lecture Note Summarization Mode
      content = `### 📝 Lecture Notes Executive Summary\n\n`;
      content += `**Core Takeaways:**\n`;
      content += `• **Foundational Principle:** Fundamental abstractions decouple high-level specifications from low-level execution details.\n`;
      content += `• **Architectural Patterns:** Layered isolation and transactional boundaries ensure robustness under concurrent loads.\n`;
      content += `• **Exam Emphasis:** Focus on definitions, trade-offs between latency vs throughput, and proof techniques.\n`;
    } else if (mode === "exam_prep" || mode === "study_plan" || (mode === "general" && docs.length === 0 && /study plan|exam prep|revision|schedule/i.test(p))) {
      // 4. Study Plan & Exam Preparation Mode
      content = `### 🎯 Structured Academic Revision & Study Plan\n\n`;
      content += `| Week / Day | Focus Topic | Recommended Activity | Self-Assessment Milestone |\n`;
      content += `| :--- | :--- | :--- | :--- |\n`;
      content += `| **Day 1–2** | Foundations & Definitions | Review lecture notes & formulas | Solve 5 practice questions |\n`;
      content += `| **Day 3–4** | Deep Dive & Proofs | Implement algorithms & dry-run proofs | Review past midterm papers |\n`;
      content += `| **Day 5** | Mock Examination | Timed self-assessment under exam conditions | Identify knowledge gaps |\n`;
      content += `| **Day 6** | Weak Area Consolidation | Consult reference books & peer discussions | Final formula sheet check |\n\n`;
      content += `_Recommendation: Combine self-paced practice quizzes with peer study sessions for maximum retention._\n`;
    } else if (docs.length > 0) {
      // 5. Grounded Academic Response (RAG)
      const primaryDoc = docs[0];

      content = `### 📚 Grounded Academic Response\n\n`;
      content += `Based on the approved course resource **${primaryDoc.title}**:\n\n`;
      content += `> ${primaryDoc.content.slice(0, 300).trim()}...\n\n`;
      content += `**Key Concept & Analysis:**\n`;
      content += `In academic context, ${p.slice(0, 80)} relates directly to the verified syllabus material. `;
      content += `The core principle establishes that system constraints, invariant properties, and algorithmic correctness dictate the expected behavior.\n\n`;
      content += `**Verified Sources:**\n`;
      sources.forEach((s) => {
        content += `- 📖 \`${s}\`\n`;
      });
      content += `\n_Note: This response is strictly grounded in official university repository documents._`;
    } else {
      // 6. General Academic Assistant
      content = `### 🎓 Campus Academic Assistant\n\n`;
      content += `Regarding your question: "${p}"\n\n`;
      content += `In academic studies, this topic emphasizes rigorous theoretical foundations coupled with practical problem-solving methodologies. `;
      content += `Ensure you review the assigned course syllabus, consult lecture slides, and test your comprehension using the **Practice Arena**.\n\n`;
      content += `If you have specific code, mathematical equations, or lecture chapters you would like me to analyze, please share them!`;
    }

    const promptTokens = Math.max(1, Math.round(prompt.length / 4));
    const completeTokens = Math.max(1, Math.round(content.length / 4));
    const totalTokens = promptTokens + completeTokens;

    return {
      content,
      promptTokens,
      completeTokens,
      totalTokens,
      model: this.model,
      sources: sources.length > 0 ? sources : undefined,
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Deterministic 1536-dimensional unit vector from text hash
    const vector = new Array(1536).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }

    let norm = 0;
    for (let i = 0; i < 1536; i++) {
      const val = Math.sin(hash + i * 0.1);
      vector[i] = val;
      norm += val * val;
    }

    // Normalize to unit vector
    norm = Math.sqrt(norm);
    return vector.map((v) => (norm > 0 ? v / norm : 0));
  }
}

/**
 * Factory to get active AI provider.
 */
let cachedProvider: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (cachedProvider) return cachedProvider;

  // In standard operation or test, default to MockAIProvider
  cachedProvider = new MockAIProvider();
  return cachedProvider;
}

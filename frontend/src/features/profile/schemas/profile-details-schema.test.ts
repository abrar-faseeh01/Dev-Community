import type { z } from "zod";
import {
  portfolioProjectSchema,
  profileDetailsSchema,
} from "./profile-details-schema";

// Real schemas, no mocks. The three-rule end-date check mirrors the backend's
// EndDateConstraint, and the URL field is the only thing standing between a
// user and a javascript: or ftp: link on their public profile, so both are
// pinned rule by rule.

function issues(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
}

const validProject = {
  title: "Dev Community",
  description: "",
  liveUrl: "https://example.com",
  githubUrl: "https://github.com/ada/dev-community",
  technologies: ["typescript"],
  startDate: "2024-01-01",
  endDate: "2024-06-01",
  isCurrent: false,
};

const URL_MESSAGE = "must be a valid URL (including http:// or https://)";

describe("portfolioProjectSchema: URL fields", () => {
  it("accepts http and https URLs", () => {
    expect(portfolioProjectSchema.safeParse(validProject).success).toBe(true);
    expect(
      portfolioProjectSchema.safeParse({
        ...validProject,
        liveUrl: "http://example.com",
      }).success,
    ).toBe(true);
  });

  it("requires both URLs", () => {
    expect(
      issues(portfolioProjectSchema, { ...validProject, liveUrl: "" }),
    ).toContainEqual({
      path: "liveUrl",
      message: "Live URL is required",
    });
    expect(
      issues(portfolioProjectSchema, { ...validProject, githubUrl: "" }),
    ).toContainEqual({
      path: "githubUrl",
      message: "GitHub URL is required",
    });
  });

  it("rejects a URL with no scheme", () => {
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        liveUrl: "example.com",
      }),
    ).toContainEqual({
      path: "liveUrl",
      message: `Live URL ${URL_MESSAGE}`,
    });
  });

  it("rejects a valid URL that is not http(s): ftp and javascript", () => {
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        githubUrl: "ftp://example.com/repo",
      }),
    ).toContainEqual({
      path: "githubUrl",
      message: `GitHub URL ${URL_MESSAGE}`,
    });
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        liveUrl: "javascript:alert(1)",
      }),
    ).toContainEqual({
      path: "liveUrl",
      message: `Live URL ${URL_MESSAGE}`,
    });
  });
});

describe("portfolioProjectSchema: end-date rules", () => {
  it("rejects an end date while 'Current' is checked", () => {
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        isCurrent: true,
        endDate: "2024-06-01",
      }),
    ).toContainEqual({
      path: "endDate",
      message: 'End date must not be set while "Current" is checked',
    });
  });

  it("requires an end date unless the project is current", () => {
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        isCurrent: false,
        endDate: "",
      }),
    ).toContainEqual({
      path: "endDate",
      message: "End date is required unless this is your current project",
    });
  });

  it("accepts a current project with no end date", () => {
    expect(
      portfolioProjectSchema.safeParse({
        ...validProject,
        isCurrent: true,
        endDate: "",
      }).success,
    ).toBe(true);
  });

  it("rejects an end date earlier than the start date", () => {
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        startDate: "2024-06-01",
        endDate: "2024-01-01",
      }),
    ).toContainEqual({
      path: "endDate",
      message: "End date must not be earlier than start date",
    });
  });

  it("accepts an end date equal to the start date", () => {
    expect(
      portfolioProjectSchema.safeParse({
        ...validProject,
        startDate: "2024-06-01",
        endDate: "2024-06-01",
      }).success,
    ).toBe(true);
  });
});

describe("portfolioProjectSchema: field limits", () => {
  it("limits the title to 120 characters (120 passes, 121 fails)", () => {
    expect(
      portfolioProjectSchema.safeParse({
        ...validProject,
        title: "a".repeat(120),
      }).success,
    ).toBe(true);
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        title: "a".repeat(121),
      }),
    ).toContainEqual({
      path: "title",
      message: "Title must be 120 characters or fewer",
    });
  });

  it("limits the description to 1000 characters", () => {
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        description: "a".repeat(1001),
      }),
    ).toContainEqual({
      path: "description",
      message: "Description must be 1000 characters or fewer",
    });
  });

  it("limits technologies: no blanks, 50 characters each, 20 in total", () => {
    expect(
      issues(portfolioProjectSchema, { ...validProject, technologies: [""] }),
    ).toContainEqual({
      path: "technologies.0",
      message: "Technology cannot be empty",
    });
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        technologies: ["a".repeat(51)],
      }),
    ).toContainEqual({
      path: "technologies.0",
      message: "Technology must be 50 characters or fewer",
    });
    expect(
      issues(portfolioProjectSchema, {
        ...validProject,
        technologies: Array.from({ length: 21 }, () => "ts"),
      }),
    ).toContainEqual({
      path: "technologies",
      message: "No more than 20 technologies",
    });
  });
});

describe("profileDetailsSchema", () => {
  const valid = {
    headline: "",
    bio: "",
    skills: [],
    portfolioProjects: [],
    reason: "",
  };

  it("accepts an empty profile (an empty skills array clears the skills)", () => {
    expect(profileDetailsSchema.safeParse(valid).success).toBe(true);
  });

  it("limits the headline to 120 characters (120 passes, 121 fails)", () => {
    expect(
      profileDetailsSchema.safeParse({ ...valid, headline: "a".repeat(120) })
        .success,
    ).toBe(true);
    expect(
      issues(profileDetailsSchema, { ...valid, headline: "a".repeat(121) }),
    ).toContainEqual({
      path: "headline",
      message: "Headline must be 120 characters or fewer",
    });
  });

  it("limits the bio to 1000 characters (1000 passes, 1001 fails)", () => {
    expect(
      profileDetailsSchema.safeParse({ ...valid, bio: "a".repeat(1000) })
        .success,
    ).toBe(true);
    expect(
      issues(profileDetailsSchema, { ...valid, bio: "a".repeat(1001) }),
    ).toContainEqual({
      path: "bio",
      message: "Bio must be 1000 characters or fewer",
    });
  });

  it("trims the headline and bio before checking them", () => {
    const result = profileDetailsSchema.safeParse({
      ...valid,
      headline: "  Engineer  ",
      bio: "  Hi  ",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.headline).toBe("Engineer");
    expect(result.success && result.data.bio).toBe("Hi");
  });

  it("rejects a blank skill", () => {
    expect(
      issues(profileDetailsSchema, { ...valid, skills: ["react", ""] }),
    ).toContainEqual({
      path: "skills.1",
      message: "Skill cannot be empty",
    });
  });

  it("limits portfolio projects to 20", () => {
    const projects = Array.from({ length: 21 }, () => validProject);
    expect(
      issues(profileDetailsSchema, { ...valid, portfolioProjects: projects }),
    ).toContainEqual({
      path: "portfolioProjects",
      message: "No more than 20 portfolio projects",
    });
  });

  it("reports a project's rule failure at its nested path", () => {
    expect(
      issues(profileDetailsSchema, {
        ...valid,
        portfolioProjects: [{ ...validProject, liveUrl: "example.com" }],
      }),
    ).toContainEqual({
      path: "portfolioProjects.0.liveUrl",
      message: `Live URL ${URL_MESSAGE}`,
    });
  });
});

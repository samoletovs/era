import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

// JWKS clients for token verification
const googleJwksClient = jwksRsa({
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
  cache: true,
  rateLimit: true,
});

const microsoftJwksClient = jwksRsa({
  jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
  cache: true,
  rateLimit: true,
});

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  provider: "google" | "microsoft";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function getSigningKey(client: jwksRsa.JwksClient, header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

async function verifyGoogleToken(token: string): Promise<AuthUser> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error("Invalid token");

  const key = await getSigningKey(googleJwksClient, decoded.header);
  const payload = jwt.verify(token, key, {
    algorithms: ["RS256"],
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  }) as jwt.JwtPayload;

  return {
    id: payload.sub!,
    email: payload.email as string,
    name: payload.name as string,
    provider: "google",
  };
}

async function verifyMicrosoftToken(token: string): Promise<AuthUser> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error("Invalid token");

  const key = await getSigningKey(microsoftJwksClient, decoded.header);
  const payload = jwt.verify(token, key, {
    algorithms: ["RS256"],
  }) as jwt.JwtPayload;

  // Validate Microsoft issuer pattern manually
  const iss = payload.iss || "";
  if (!iss.startsWith("https://login.microsoftonline.com/") || !iss.endsWith("/v2.0")) {
    throw new Error("Invalid Microsoft issuer");
  }

  return {
    id: payload.oid || payload.sub!,
    email: (payload.preferred_username || payload.email) as string,
    name: payload.name as string,
    provider: "microsoft",
  };
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Dev bypass for local development
  if (process.env.NODE_ENV === "development") {
    const authHeader = req.headers.authorization;
    if (authHeader === "Bearer dev-bypass") {
      req.user = { id: "dev-user", email: "dev@era.local", name: "Developer", provider: "google" };
      next();
      return;
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing bearer token" } });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Try Google first, then Microsoft
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
      return;
    }

    const issuer = (decoded.payload as jwt.JwtPayload).iss || "";
    let user: AuthUser;

    if (issuer.includes("accounts.google.com")) {
      user = await verifyGoogleToken(token);
    } else if (issuer.includes("login.microsoftonline.com")) {
      user = await verifyMicrosoftToken(token);
    } else {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Unknown token issuer" } });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Token verification failed" } });
  }
}

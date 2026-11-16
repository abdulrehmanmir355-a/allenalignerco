
"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export default function AdminLogin() {
  const [message, setMessage] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMessage(
      "Admin authentication is not enabled yet."
    );
  }

  return (
    <main
      style={{
        maxWidth: "450px",
        margin: "80px auto",
        padding: "30px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1
        style={{
          textAlign: "center",
          color: "#0f766e",
          fontSize: "30px",
          fontWeight: "bold",
        }}
      >
        ALLEN ALIGNER
      </h1>

      <h2
        style={{
          textAlign: "center",
          margin: "25px 0",
          fontSize: "23px",
        }}
      >
        Admin Login
      </h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Admin Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          placeholder="Enter admin email"
          style={{
            width: "100%",
            padding: "12px",
            margin: "10px 0 20px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            boxSizing: "border-box",
          }}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Enter password"
          style={{
            width: "100%",
            padding: "12px",
            margin: "10px 0 20px",
            border: "1px solid #ccc",
            borderRadius: "6px",
            boxSizing: "border-box",
          }}
        />

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: "#0f766e",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Login
        </button>
      </form>

      {message && (
        <p role="status" style={{ marginTop: "20px" }}>
          {message}
        </p>
      )}

      <p style={{ marginTop: "20px", fontSize: "12px" }}>
        Development only. Secure admin authentication
        is not yet implemented.
      </p>
    </main>
  );
}

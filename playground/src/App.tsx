import { useState } from "react";
import "./App.css";
import { useMutation, useQuery, useStatus } from "../edgepod/client";

function App() {
  const { data: users } = useQuery("getUsers");
  const { trigger } = useMutation("createUser");
  const { trigger: triggerDeleteUser } = useMutation("deleteUser");
  const status = useStatus();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    trigger({ email, name });
    setName("");
    setEmail("");
  };

  return (
    <>
      <section id="center">
        <p>status: {status}</p>
        <form onSubmit={handleSubmit}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit">Add</button>
        </form>
        <ul>
          {users?.map((u) => (
            <li key={u.id}>
              {u.name} &lt;{u.email}&gt;{" "}
              <button type="button" onClick={() => triggerDeleteUser({ id: u.id })}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default App;

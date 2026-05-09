import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiTrash2, FiEdit2 } from "react-icons/fi";
import { ConfirmDialog } from "./ConfirmDialog";

export default function UserCard({ user, allContacts, onClick, onCall, onDelete }) {

	const [selectedServer, setSelectedServer] = useState(user.contact.selectedSignallingServer)
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [serverStatusMap, setServerStatusMap] = useState(false);

	const navigate = useNavigate();
	const [confirmOpen, setConfirmOpen] = useState(false);

	/* ---------------- CHECK SERVER ---------------- */
	const checkServer = async (url) => {
		return new Promise((resolve) => {
			const timeout = setTimeout(() => resolve(false), 2000);

			try {
				const ws = new WebSocket(url);

				ws.onopen = () => {
					clearTimeout(timeout);
					ws.close();
					resolve(true);
				};

				ws.onerror = () => {
					clearTimeout(timeout);
					resolve(false);
				};
			} catch {
				clearTimeout(timeout);
				resolve(false);
			}
		});
	};

	/* ---------------- SERVER LIST ---------------- */
	const getAllServers = () => {
		if (!allContacts) return [];

		const servers = [];

		allContacts.forEach(c => {
			const list = c.signallingServers;

			list.forEach(url => servers.push(url));
		});

		return [...new Set(servers)];
	};

	const contactServers = user.signallingServers;
	const globalServers = getAllServers();

	const commonServers = contactServers.filter(url =>
		globalServers.includes(url)
	);

	/* ---------------- LOAD SERVER STATUS ---------------- */
	useEffect(() => {
		const checkAll = async () => {
			const result = {};

			for (const url of commonServers) {
				result[url] = await checkServer(url);
			}

			setServerStatusMap(result);
		};
		checkAll();
	}, [commonServers]);

	/* ---------------- EDIT ---------------- */
	const handleEdit = async (e) => {
		e.stopPropagation();

		try {
			let publicKeyString = user.publicKey;

			//if (user.publicKey && typeof user.publicKey === "object") {
			//	publicKeyString = await exportECDSAPublicKey(user.publicKey);
			//}

			navigate("/contact", {
				state: {
					editMode: true,
					originalUserName: user.name,
					contact: {
						userName: user.name,
						publicKey: publicKeyString,
						signallingServers: user.signallingServers || []
					}
				}
			});
		} catch (err) {
			console.error(err);
			alert("Failed to edit contact");
		}
	};

	return (
		<div
			onClick={onClick}
			className="relative flex flex-col bg-white p-3 sm:p-4 rounded-xl shadow hover:shadow-md transition cursor-pointer"
		>

			{/* ---------------- HEADER ---------------- */}
			<div className="flex items-center gap-4 mb-3">
				<img
					src={user.avatar || "https://via.placeholder.com/80"}
					alt={user.name}
					className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover flex-shrink-0"
				/>

				<div className="flex-1 min-w-0">
					<p className="font-medium text-gray-900">{user.name}</p>
				</div>
			</div>

			{/* ---------------- SERVER DROPDOWN ---------------- */}
			{commonServers.length > 0 && (
				<div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">

					<p className="text-xs font-semibold text-gray-600 mb-2">
						Select Signaling Server
					</p>

					<button
						onClick={(e) => {
							e.stopPropagation();
							setDropdownOpen(!dropdownOpen);
						}}
						className="w-full flex items-center justify-between bg-white border p-2 rounded"
					>
						<span className="text-xs font-mono truncate">
							{selectedServer || "Choose server"}
						</span>
						<span>{dropdownOpen ? "▲" : "▼"}</span>
					</button>

					{dropdownOpen && (
						<div className="mt-2 space-y-2">
							{commonServers.map((url, idx) => {
								const status = serverStatusMap[url];

								return (
									<div
										key={idx}
										className={`flex items-center justify-between p-2 rounded border cursor-pointer ${selectedServer === url
												? "bg-blue-50 border-blue-400"
												: "bg-white"
											}`}
										onClick={(e) => {
											e.stopPropagation();
											setSelectedServer(url);
											setDropdownOpen(false);
											user.contact.selectedSignallingServer = url;
										}}
									>
										<span className="text-xs font-mono break-all flex-1">
											{url}
										</span>

										<span className="text-xs ml-2">
											{status === true && "🟢"}
											{status === false && "🔴"}
											{status === undefined && "🟡"}
										</span>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{/* ---------------- ACTION BUTTONS ---------------- */}
			<div className="flex gap-2 justify-end">

				{/* Edit */}
				<button
					onClick={handleEdit}
					className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white"
				>
					<FiEdit2 size={18} />
				</button>

				{/* Delete */}
				<button
					onClick={(e) => {
						e.stopPropagation();
						setConfirmOpen(true);
					}}
					className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white"
				>
					<FiTrash2 size={18} />
				</button>

				{/* Call */}
				<button
					onClick={(e) => {
						e.stopPropagation();
						onCall();
					}}
					className="p-3 rounded-full bg-green-500 hover:bg-green-600 text-white"
				>
					📞
				</button>
			</div>

			{/* ---------------- DELETE CONFIRM ---------------- */}
			{confirmOpen && (
				<ConfirmDialog
					open={confirmOpen}
					title="Confirm Delete"
					message={`Are you sure you want to delete ${user.name}?`}
					onConfirm={async () => {
						await onDelete();
						setConfirmOpen(false);
					}}
					onCancel={() => setConfirmOpen(false)}
				/>
			)}
		</div>
	);
}

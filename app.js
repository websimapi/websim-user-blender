const { useState, useEffect, useRef } = React;

const BlenderApp = () => {
    const [followingUsers, setFollowingUsers] = useState([]);
    const [usersInBlender, setUsersInBlender] = useState([]);
    const [isBlending, setIsBlending] = useState(false);
    const [isPouring, setIsPouring] = useState(false);
    const [blendedResult, setBlendedResult] = useState(null);
    const [creations, setCreations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const blenderRef = useRef(null);
    const room = useRef(null);

    useEffect(() => {
        // Create WebSocket connection
        room.current = new WebsimSocket();
        
        // Fetch following users
        fetchFollowingUsers();
        
        // Load saved creations
        loadCreations();
        
        // Initialize animation loop for blender contents
        const animationInterval = setInterval(() => {
            if (usersInBlender.length > 0) {
                animateUsersInBlender();
            }
        }, 100);
        
        return () => clearInterval(animationInterval);
    }, []);
    
    useEffect(() => {
        // Subscribe to any new creations added to the database
        if (room.current) {
            room.current.collection('blended_creation').subscribe(newCreations => {
                setCreations(newCreations);
            });
        }
    }, [room.current]);

    const fetchFollowingUsers = async () => {
        try {
            const user = await window.websim.getUser();
            if (!user) {
                setIsLoading(false);
                return;
            }
            
            const response = await fetch(`/api/v1/users/${user.username}/following`);
            const data = await response.json();
            
            const followingData = data.following.data.map(item => ({
                id: item.follow.user.id,
                username: item.follow.user.username,
                avatarUrl: `https://images.websim.ai/avatar/${item.follow.user.username}`
            }));
            
            setFollowingUsers(followingData);
            setIsLoading(false);
        } catch (error) {
            console.error("Error fetching following users:", error);
            setIsLoading(false);
        }
    };
    
    const loadCreations = async () => {
        try {
            const savedCreations = room.current.collection('blended_creation').getList();
            setCreations(savedCreations);
        } catch (error) {
            console.error("Error loading creations:", error);
        }
    };

    const handleDragStart = (e, user) => {
        e.dataTransfer.setData("user", JSON.stringify(user));
        e.target.classList.add("dragging");
    };

    const handleDragEnd = (e) => {
        e.target.classList.remove("dragging");
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const user = JSON.parse(e.dataTransfer.getData("user"));
        
        // Check if user is already in blender
        if (!usersInBlender.some(u => u.id === user.id)) {
            const rect = blenderRef.current.getBoundingClientRect();
            const x = Math.random() * (rect.width - 40);
            const y = Math.random() * (rect.height - 40);
            
            setUsersInBlender(prev => [...prev, {
                ...user,
                position: { x, y },
                velocity: {
                    x: (Math.random() - 0.5) * 4,
                    y: (Math.random() - 0.5) * 4
                }
            }]);
        }
    };
    
    const animateUsersInBlender = () => {
        setUsersInBlender(prevUsers => {
            if (!blenderRef.current) return prevUsers;
            
            const rect = blenderRef.current.getBoundingClientRect();
            const width = rect.width - 40; // User avatar width
            const height = rect.height - 40; // User avatar height
            
            return prevUsers.map(user => {
                let { x, y } = user.position;
                let { x: vx, y: vy } = user.velocity;
                
                // Update position
                x += vx;
                y += vy;
                
                // Bounce off walls
                if (x <= 0 || x >= width) {
                    vx = -vx * 0.9;
                    x = x <= 0 ? 0 : width;
                }
                
                if (y <= 0 || y >= height) {
                    vy = -vy * 0.9;
                    y = y <= 0 ? 0 : height;
                }
                
                // Add some random movement
                if (Math.random() < 0.05) {
                    vx += (Math.random() - 0.5) * 2;
                    vy += (Math.random() - 0.5) * 2;
                }
                
                // Limit velocity
                const maxVelocity = 5;
                vx = Math.max(-maxVelocity, Math.min(maxVelocity, vx));
                vy = Math.max(-maxVelocity, Math.min(maxVelocity, vy));
                
                return {
                    ...user,
                    position: { x, y },
                    velocity: { x: vx, y: vy }
                };
            });
        });
    };

    const handleBlend = async () => {
        if (usersInBlender.length === 0) return;
        
        setIsBlending(true);
        
        try {
            // Analyze each user's profile picture
            const analyses = await Promise.all(usersInBlender.map(async (user) => {
                const result = await websim.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: `Analyze this user profile picture in detail. Focus on the subject, colors, style, mood, and any distinct elements.`
                        },
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: `This is the profile picture of user: ${user.username}. Please provide a detailed JSON analysis.`
                                },
                                {
                                    type: "image_url",
                                    image_url: { url: user.avatarUrl }
                                }
                            ]
                        }
                    ],
                    json: true
                });
                
                return {
                    username: user.username,
                    analysis: JSON.parse(result.content)
                };
            }));
            
            // Generate a blended idea from all analyses
            const blendPrompt = analyses.map(a => 
                `User ${a.username}: ${JSON.stringify(a.analysis)}`
            ).join("\n\n");
            
            const blendedResult = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are an image blender. Based on the detailed analyses of these profile pictures, create a coherent description for a single blended image that incorporates elements from all of them. Return a JSON with keys: description, style, colors, mood, and elements.`
                    },
                    {
                        role: "user",
                        content: blendPrompt
                    }
                ],
                json: true
            });
            
            const blendedDescription = JSON.parse(blendedResult.content);
            
            // Generate the final blended image
            const imageResult = await websim.imageGen({
                prompt: `${blendedDescription.description}. Style: ${blendedDescription.style}. Colors: ${blendedDescription.colors}. Mood: ${blendedDescription.mood}. Key elements: ${blendedDescription.elements}.`,
                aspect_ratio: "1:1"
            });
            
            // Save result
            setBlendedResult({
                imageUrl: imageResult.url,
                description: blendedDescription.description,
                users: usersInBlender.map(u => u.username),
                userIds: usersInBlender.map(u => u.id),
                timestamp: new Date().toISOString()
            });
            
            // Save to database
            await room.current.collection('blended_creation').create({
                imageUrl: imageResult.url,
                description: blendedDescription.description,
                users: usersInBlender.map(u => u.username),
                userIds: usersInBlender.map(u => u.id)
            });
            
            setIsBlending(false);
            setIsPouring(true);
            
            // Reset after pouring animation completes
            setTimeout(() => {
                setIsPouring(false);
                setUsersInBlender([]);
            }, 2000);
            
        } catch (error) {
            console.error("Error in blending process:", error);
            setIsBlending(false);
        }
    };

    const removeFromBlender = (userId) => {
        setUsersInBlender(prev => prev.filter(user => user.id !== userId));
    };

    return (
        <div className="container">
            <h1 className="title">User Blender</h1>
            
            {isLoading ? (
                <div className="loading-spinner"></div>
            ) : (
                <>
                    <h2>Your Following</h2>
                    {followingUsers.length === 0 ? (
                        <p>You aren't following anyone yet.</p>
                    ) : (
                        <div className="following-list">
                            {followingUsers.map(user => (
                                <div 
                                    key={user.id}
                                    className="user-item"
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, user)}
                                    onDragEnd={handleDragEnd}
                                    title={`@${user.username}`}
                                >
                                    <img src={user.avatarUrl} alt={user.username} />
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <div className="blender-section">
                        <h2>Drag users to blend</h2>
                        <div 
                            className="blender-container"
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                        >
                            <div 
                                className={`blender ${isBlending ? 'shake-animation' : ''} ${isPouring ? 'pour-animation' : ''}`}
                                ref={blenderRef}
                            >
                                {usersInBlender.map((user, index) => (
                                    <div 
                                        key={`${user.id}-${index}`}
                                        className="user-in-blender"
                                        style={{
                                            backgroundImage: `url(${user.avatarUrl})`,
                                            left: `${user.position.x}px`,
                                            top: `${user.position.y}px`
                                        }}
                                        onClick={() => removeFromBlender(user.id)}
                                        title={`Remove ${user.username}`}
                                    />
                                ))}
                            </div>
                        </div>
                        
                        <div className="blender-control">
                            <button 
                                className="blend-button"
                                onClick={handleBlend}
                                disabled={usersInBlender.length === 0 || isBlending || isPouring}
                            >
                                {isBlending ? 'Blending...' : 'Blend!'}
                            </button>
                        </div>
                    </div>
                    
                    {blendedResult && (
                        <div className="result-section">
                            <h2>Blended Result</h2>
                            <p>Created from: {blendedResult.users.join(', ')}</p>
                            <div className="pouring-animation">
                                {isPouring ? (
                                    <div className="loading-spinner"></div>
                                ) : (
                                    <img 
                                        src={blendedResult.imageUrl} 
                                        alt="Blended result"
                                        className="blended-avatar drop-animation"
                                    />
                                )}
                            </div>
                            <p>{blendedResult.description}</p>
                        </div>
                    )}
                    
                    {creations.length > 0 && (
                        <div className="community-creations">
                            <h2>Community Blends</h2>
                            <div className="creations-gallery">
                                {creations.map(creation => (
                                    <div key={creation.id} className="creation-item">
                                        <img src={creation.imageUrl} alt="Blended creation" />
                                        <div className="creation-info">
                                            <p>Users: {creation.users.length}</p>
                                            <p>By: {creation.username}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

ReactDOM.render(<BlenderApp />, document.getElementById('app'));


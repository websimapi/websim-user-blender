const { useState, useEffect, useRef } = React;

const BlenderApp = () => {
    const [followingUsers, setFollowingUsers] = useState([]);
    const [usersInBlender, setUsersInBlender] = useState([]);
    const [isBlending, setIsBlending] = useState(false);
    const [isPouring, setIsPouring] = useState(false);
    const [blendedResult, setBlendedResult] = useState(null);
    const [creations, setCreations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState("");
    const [hasMore, setHasMore] = useState(false);
    const [hasPrevious, setHasPrevious] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const blenderRef = useRef(null);
    const room = useRef(null);

    useEffect(() => {
        // Create WebSocket connection
        room.current = new WebsimSocket();
        
        // Fetch following users
        fetchFollowingUsers(1, searchTerm);
        
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

    const fetchFollowingUsers = async (pageNum = 1, search = "") => {
        try {
            const user = await window.websim.getUser();
            if (!user) {
                setIsLoading(false);
                return;
            }
            
            setLoadingMore(pageNum > 1);
            
            // Fix pagination by using cursors properly
            let url = `/api/v1/user/following?first=20`;
            
            // If there's a cursor stored for pagination, use it
            if (pageNum > 1 && followingUsers.length > 0) {
                const lastIndex = followingUsers.length - 1;
                const lastCursor = followingUsers[lastIndex]?.cursor;
                if (lastCursor) {
                    url += `&after=${lastCursor}`;
                }
            }
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (!data.following || !data.following.data) {
                console.error("Unexpected API response format:", data);
                setIsLoading(false);
                setLoadingMore(false);
                return;
            }
            
            const followingData = data.following.data
                .map(item => ({
                    id: item.follow.user.id,
                    username: item.follow.user.username,
                    avatarUrl: `https://images.websim.ai/avatar/${item.follow.user.username}`,
                    cursor: item.cursor
                }))
                .filter(user => !search || user.username.toLowerCase().includes(search.toLowerCase()));
            
            setFollowingUsers(followingData);
            setHasMore(data.following.meta.has_next_page);
            setHasPrevious(pageNum > 1);
            setIsLoading(false);
            setLoadingMore(false);
        } catch (error) {
            console.error("Error fetching following users:", error);
            setIsLoading(false);
            setLoadingMore(false);
        }
    };
    
    useEffect(() => {
        fetchFollowingUsers(1, searchTerm);
    }, [searchTerm]);
    
    const goToNextPage = () => {
        if (hasMore && !loadingMore) {
            setPage(prevPage => {
                const nextPage = prevPage + 1;
                fetchFollowingUsers(nextPage, searchTerm);
                return nextPage;
            });
        }
    };
    
    const goToPreviousPage = () => {
        if (page > 1 && !loadingMore) {
            setPage(prevPage => {
                const prevPageNum = prevPage - 1;
                fetchFollowingUsers(prevPageNum, searchTerm);
                return prevPageNum;
            });
        }
    };
    
    const loadMoreUsers = () => {
        if (hasMore && !loadingMore) {
            setPage(prevPage => {
                const nextPage = prevPage + 1;
                fetchFollowingUsers(nextPage, searchTerm);
                return nextPage;
            });
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

    const fetchAvatarAsDataUrl = async (avatarUrl) => {
        try {
            // Create a canvas to convert the image
            const response = await fetch(avatarUrl);
            const blob = await response.blob();
            
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Error fetching avatar:', error);
            // Return a fallback image or null
            return null;
        }
    };

    const handleBlend = async () => {
        if (usersInBlender.length === 0) return;
        
        setIsBlending(true);
        
        try {
            // Analyze each user's avatar image
            const imageAnalyses = [];
            for (const user of usersInBlender) {
                let retryCount = 0;
                let success = false;
                let analysis = null;
                
                // First get the avatar as data URL to avoid CORS issues
                const avatarDataUrl = await fetchAvatarAsDataUrl(user.avatarUrl);
                
                if (!avatarDataUrl) {
                    // If we couldn't get the avatar, use a fallback description
                    imageAnalyses.push({
                        username: user.username,
                        description: `A profile picture for user ${user.username}`
                    });
                    continue;
                }
                
                while (retryCount < 3 && !success) {
                    try {
                        analysis = await websim.chat.completions.create({
                            messages: [
                                {
                                    role: "system",
                                    content: "You are an AI that analyzes profile images and provides detailed descriptions of their visual content, style, and notable features."
                                },
                                {
                                    role: "user",
                                    content: [
                                        {
                                            type: "text",
                                            text: "Describe this profile image in detail, focusing on color scheme, style, notable features, and visual elements."
                                        },
                                        {
                                            type: "image_url",
                                            image_url: { url: avatarDataUrl }
                                        }
                                    ]
                                }
                            ]
                        });
                        success = true;
                    } catch (error) {
                        console.error(`Error analyzing image for ${user.username} (attempt ${retryCount + 1}):`, error);
                        retryCount++;
                        // Wait before retrying
                        if (retryCount < 3) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
                
                if (success && analysis) {
                    imageAnalyses.push({
                        username: user.username,
                        description: analysis.content
                    });
                } else {
                    // Fallback description if all retries failed
                    imageAnalyses.push({
                        username: user.username,
                        description: `A profile picture for user ${user.username}`
                    });
                }
            }
            
            // Combine analyses into a detailed prompt for the blended image
            const analysisText = imageAnalyses.map(a => `${a.username}: ${a.description}`).join('\n\n');
            
            let blendingGuidance;
            try {
                blendingGuidance = await websim.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert avatar creator. Based on the descriptions of multiple profile images, create a detailed prompt for an AI image generator to blend these into a cohesive new avatar."
                        },
                        {
                            role: "user",
                            content: `Original image descriptions:\n${analysisText}\n\nCreate a detailed generation prompt for a beautiful, artistic avatar that combines elements from all these profile images into one cohesive design. The result should be visually appealing and represent a blend of the styles and elements from the originals.`
                        }
                    ]
                });
            } catch (error) {
                console.error("Error creating blending guidance:", error);
                // Fallback if the guidance creation fails
                blendingGuidance = {
                    content: `Create a beautiful avatar that combines elements from these users: ${usersInBlender.map(u => u.username).join(', ')}. ${analysisText.substring(0, 500)}...`
                };
            }
            
            // Generate the blended image using the refined prompt
            const imageResult = await websim.imageGen({
                prompt: blendingGuidance.content,
                aspect_ratio: "1:1"
            });
            
            // Save result
            setBlendedResult({
                imageUrl: imageResult.url,
                description: blendingGuidance.content,
                analyses: imageAnalyses,
                users: usersInBlender.map(u => u.username),
                userIds: usersInBlender.map(u => u.id),
                timestamp: new Date().toISOString()
            });
            
            // Save to database
            await room.current.collection('blended_creation').create({
                imageUrl: imageResult.url,
                description: blendingGuidance.content,
                analyses: imageAnalyses.map(a => ({ username: a.username, description: a.description })),
                users: usersInBlender.map(u => u.username),
                userIds: usersInBlender.map(u => u.id),
                username: room.current.party.client.username
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
            
            // Show a user-friendly error message
            alert("There was an error creating your blend. Please try again with fewer users.");
        }
    };
    
    const removeFromBlender = (userId) => {
        setUsersInBlender(prev => prev.filter(user => user.id !== userId));
    };

    return (
        <div className="container">
            <h1 className="title">User Blender</h1>
            
            {isLoading && page === 1 ? (
                <div className="loading-spinner"></div>
            ) : (
                <>
                    <h2>Your Following</h2>
                    <div className="search-container">
                        <input 
                            type="text" 
                            placeholder="Search users..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                    </div>
                    
                    {followingUsers.length === 0 ? (
                        <p>{searchTerm ? "No users match your search." : "You aren't following anyone yet."}</p>
                    ) : (
                        <>
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
                                        <span className="user-name">{user.username}</span>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="pagination-controls">
                                <button 
                                    className="pagination-button" 
                                    onClick={goToPreviousPage}
                                    disabled={!hasPrevious || loadingMore}
                                >
                                    Previous
                                </button>
                                <button 
                                    className="pagination-button" 
                                    onClick={goToNextPage}
                                    disabled={!hasMore || loadingMore}
                                >
                                    {loadingMore ? 'Loading...' : 'Next'}
                                </button>
                            </div>
                        </>
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
                            <details>
                                <summary>Image prompt</summary>
                                <p className="image-prompt">{blendedResult.description}</p>
                            </details>
                            {blendedResult.analyses && (
                                <details>
                                    <summary>Image analyses</summary>
                                    <div className="analyses-list">
                                        {blendedResult.analyses.map((analysis, index) => (
                                            <div key={index} className="analysis-item">
                                                <h4>{analysis.username}</h4>
                                                <p>{analysis.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
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